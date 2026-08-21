const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: '127.0.0.1', user: 'root', password: '', database: 'supricom_panel'
  });
  try {
    const [r] = await c.execute(
      "SELECT kpi_key, semana_index, valor, meta FROM kpi_weekly_data WHERE company_id = 9 AND mes = '2026-08' ORDER BY kpi_key, semana_index"
    );
    console.log('Weekly data for company 9, Aug 2026:', JSON.stringify(r, null, 2));
  } catch (e) {
    console.log('Error:', e.message);
  }
  await c.close();
})();
