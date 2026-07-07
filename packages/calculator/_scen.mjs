import { readFileSync } from 'fs';
import { calculatePayroll } from './dist/calculations/payroll.js';
const cfg = JSON.parse(readFileSync('./src/config/rates.2026.json','utf8'));
const worker = { id:'t', full_name:'Test', start_date:'2024-01-01', daily_salary:400, wage_zone:'general', days_per_week:6 };
function run(label, period){
  const r = calculatePayroll(worker, period, cfg);
  console.log(`\n### ${label}`);
  console.log('gross', r.gross_wages, '| vac_pay', r.vacation_pay, '| prima', r.prima_vacacional,
    '| imss_worker', r.imss.total_worker, '| imss_employer', r.imss.total_employer,
    '| isr', r.isr.period_isr_withholding, '| net', r.net_pay, '| employer_cost', r.employer_total_cost);
  console.log('  isr: monthlyIncome', r.isr.monthly_income_equivalent, 'grossISR', r.isr.monthly_isr_gross, 'subsidy', r.isr.monthly_employment_subsidy, 'netMonthly', r.isr.monthly_isr_net, 'sbc', r.imss.sbc);
  return r;
}
const base = {start_date:'2026-06-30', end_date:'2026-07-06', holiday_days_worked:0, rest_days_worked:0};
const t2 = run('Test2 weekly 6d no vac', {...base, days_worked:6, vacation_days:0});
const t3 = run('Test3 weekly 6d,2 vac', {...base, days_worked:6, vacation_days:2});
const t4 = run('Test4 monthly 26d', {start_date:'2026-06-01', end_date:'2026-06-30', days_worked:26, holiday_days_worked:0, rest_days_worked:0, vacation_days:0});
console.log('\nDelta t3-t2 gross =', (t3.gross_wages - t2.gross_wages).toFixed(2), '(expect prima on 2 days =', (400*2*0.25).toFixed(2),')');
const wmin = { id:'m', full_name:'Min', start_date:'2024-01-01', daily_salary:cfg.minimum_daily_wage_general, wage_zone:'general', days_per_week:6 };
const rmin = calculatePayroll(wmin, {...base, days_worked:6, vacation_days:0}, cfg);
console.log('\n### Minimum-wage worker (daily', cfg.minimum_daily_wage_general,') weekly 6d');
console.log('  monthlyIncome', rmin.isr.monthly_income_equivalent, 'grossISR', rmin.isr.monthly_isr_gross, 'subsidy', rmin.isr.monthly_employment_subsidy, 'periodISR', rmin.isr.period_isr_withholding, 'net', rmin.net_pay);
