import axios from 'axios';

async function testHttpDates() {
  try {
    const loginRes = await axios.post('http://localhost:8000/auth/login', {
      username: 'hanley',
      password: 'Kibalion2',
    });

    const token = loginRes.data.access_token || loginRes.data.token;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59).toISOString();

    console.log(`Testing query with start_date=${startStr}&end_date=${endStr}`);

    const reportRes = await axios.get('http://localhost:8000/api/commercial/reports/refunds', {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        start_date: startStr,
        end_date: endStr,
      }
    });

    console.log('--- RESULT WITH DATES ---');
    console.log('Summary:', reportRes.data.summary);
    console.log('Invoices count:', reportRes.data.invoices.length);
  } catch (error: any) {
    console.error('❌ Error HTTP:', error.response?.status, error.response?.data || error.message);
  }
}

testHttpDates();
