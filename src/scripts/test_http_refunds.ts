import axios from 'axios';

async function testHttp() {
  try {
    // Login as super admin hanley or user
    const loginRes = await axios.post('http://localhost:8000/auth/login', {
      username: 'hanley',
      password: 'Kibalion2',
    });

    const token = loginRes.data.access_token || loginRes.data.token;
    console.log('Login exitoso! Token obtenido.');

    const reportRes = await axios.get('http://localhost:8000/api/commercial/reports/refunds', {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log('--- HTTP RESPONSE FROM /api/commercial/reports/refunds ---');
    console.log('Summary:', JSON.stringify(reportRes.data.summary, null, 2));
    console.log('Invoices count:', reportRes.data.invoices.length);
    console.log('Invoices sample:', JSON.stringify(reportRes.data.invoices, null, 2));
  } catch (error: any) {
    console.error('❌ Error HTTP:', error.response?.status, error.response?.data || error.message);
  }
}

testHttp();
