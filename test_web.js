require('dotenv').config();

async function testQuartix() {
  const authUrl = `${process.env.QUARTIX_BASE_URL}/auth`;

  const form = new URLSearchParams();
  form.append('CustomerID', process.env.QUARTIX_CUSTOMER_ID);
  form.append('UserName', process.env.QUARTIX_USERNAME);
  form.append('Password', process.env.QUARTIX_PASSWORD);
  form.append('Application', process.env.QUARTIX_APPLICATION || 'YOVATRANS');

  const authRes = await fetch(authUrl, {
    method: 'POST',
    body: form
  });

  const authData = await authRes.json();
  console.log('AUTH STATUS:', authRes.status);
  console.log(JSON.stringify(authData, null, 2));

  const token = authData?.Data?.AccessToken;

  if (!token) {
    console.log('❌ Pas de token Quartix');
    return;
  }

  const liveRes = await fetch(`${process.env.QUARTIX_BASE_URL}/vehicles/live`, {
    headers: {
      AccessToken: token
    }
  });

  const liveData = await liveRes.json();
  console.log('LIVE STATUS:', liveRes.status);
  console.log(JSON.stringify(liveData, null, 2));
}

testQuartix().catch(console.error);