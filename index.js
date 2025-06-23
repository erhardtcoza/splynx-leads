// index.js

const SPYLNX_BASE = 'https://splynx.vinet.co.za/api/2.0';
const SPYLNX_AUTH = (env) => ({
  'Authorization': `Basic ${env.SPYLNX_AUTH}`,
  'Content-Type': 'application/json'
});

// Main worker export
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Serve frontend
    if (request.method === 'GET' && url.pathname === '/') {
      return new Response(htmlPage(), { headers: { 'content-type': 'text/html' } });
    }

    // Email/phone lookup
    if (request.method === 'POST' && url.pathname === '/api/check') {
      const { email, phone } = await request.json();

      // Email lookup
      if (email) {
        const found = await lookupEmail(email, env);
        return Response.json(found);
      }
      // Phone lookup
      if (phone) {
        const found = await lookupPhone(phone, env);
        return Response.json(found);
      }
      return Response.json({ error: "Missing email or phone" }, { status: 400 });
    }

    // Lead creation
    if (request.method === 'POST' && url.pathname === '/api/create') {
      const { email, phone, address } = await request.json();
      if (!email || !phone || !address)
        return Response.json({ error: "Missing fields" }, { status: 400 });

      const lead = await createLead({ email, phone, address }, env);
      if (lead && lead.id)
        return Response.json({
          success: true,
          id: lead.id,
          url: `https://splynx.vinet.co.za/admin/crm/leads/view/${lead.id}`
        });
      return Response.json({ error: "Could not create lead" }, { status: 500 });
    }

    return new Response("Not found", { status: 404 });
  }
};

// ---- Helper functions ----

// Check email in customers and leads
async function lookupEmail(email, env) {
  // Customers
  let r = await fetch(`${SPYLNX_BASE}/admin/customers/customer?main_email=${encodeURIComponent(email)}`, {
    headers: SPYLNX_AUTH(env)
  });
  let data = await r.json();
  if (data && data.length > 0)
    return { found: true, where: 'customer', id: data[0].id };

  // Leads
  r = await fetch(`${SPYLNX_BASE}/admin/crm/leads?email=${encodeURIComponent(email)}`, {
    headers: SPYLNX_AUTH(env)
  });
  data = await r.json();
  if (data && data.length > 0)
    return { found: true, where: 'lead', id: data[0].id };

  return { found: false };
}

// Check phone in customers and leads
async function lookupPhone(phone, env) {
  // Customers
  let r = await fetch(`${SPYLNX_BASE}/admin/customers/customer?phone=${encodeURIComponent(phone)}`, {
    headers: SPYLNX_AUTH(env)
  });
  let data = await r.json();
  if (data && data.length > 0)
    return { found: true, where: 'customer', id: data[0].id };

  // Leads
  r = await fetch(`${SPYLNX_BASE}/admin/crm/leads?phone=${encodeURIComponent(phone)}`, {
    headers: SPYLNX_AUTH(env)
  });
  data = await r.json();
  if (data && data.length > 0)
    return { found: true, where: 'lead', id: data[0].id };

  return { found: false };
}

// Create lead in Splynx
async function createLead({ email, phone, address }, env) {
  const body = JSON.stringify({
    email,
    phone,
    address
  });
  const r = await fetch(`${SPYLNX_BASE}/admin/crm/leads`, {
    method: 'POST',
    headers: SPYLNX_AUTH(env),
    body
  });
  try {
    return await r.json();
  } catch (e) {
    return null;
  }
}

// ---- Frontend (HTML + JS) ----

function htmlPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Vinet Sales Lead Capture</title>
  <style>
    body { font-family: sans-serif; background: #fff; color: #222; margin: 0; padding: 0; }
    .main { max-width: 400px; margin: 60px auto; border: 1px solid #eee; border-radius: 16px; padding: 32px; box-shadow: 0 2px 12px #0001;}
    h2 { color: #D00; margin-top: 0; }
    label { display: block; margin-top: 1.5em; }
    input { width: 100%; padding: 8px; margin-top: 6px; border-radius: 6px; border: 1px solid #ddd; font-size: 1.1em; }
    button { margin-top: 1.6em; padding: 10px 24px; font-size: 1.1em; border-radius: 8px; border: none; background: #D00; color: #fff; cursor: pointer;}
    button:disabled { background: #ccc; }
    .hidden { display: none; }
    #result { margin-top: 2em; font-weight: bold; }
    .error { color: #d00; }
    .success { color: #090; }
  </style>
</head>
<body>
  <div class="main">
    <h2>Vinet Lead Capture</h2>
    <form id="lead-form" autocomplete="off">
      <div id="step-email">
        <label>Email address
          <input type="email" id="email" required autocomplete="off">
        </label>
        <button type="submit" id="next-email">Next</button>
      </div>
      <div id="step-phone" class="hidden">
        <label>Phone number
          <input type="tel" id="phone" required autocomplete="off">
        </label>
        <button type="submit" id="next-phone">Next</button>
      </div>
      <div id="step-address" class="hidden">
        <label>Address
          <input type="text" id="address" required autocomplete="off">
        </label>
        <button type="submit" id="submit-lead">Submit</button>
      </div>
    </form>
    <div id="result"></div>
  </div>
  <script>
    const form = document.getElementById('lead-form');
    const emailStep = document.getElementById('step-email');
    const phoneStep = document.getElementById('step-phone');
    const addressStep = document.getElementById('step-address');
    const result = document.getElementById('result');

    let state = {
      email: "",
      phone: "",
      address: ""
    };

    // Step 1: Email
    emailStep.querySelector('button').onclick = async (e) => {
      e.preventDefault();
      const email = emailStep.querySelector('input').value.trim();
      if (!email) return;
      result.innerHTML = "";
      // Check email
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.found) {
        result.innerHTML = '<span class="error">Email already exists as a ' + data.where + '.</span>';
        return;
      }
      state.email = email;
      emailStep.classList.add('hidden');
      phoneStep.classList.remove('hidden');
      phoneStep.querySelector('input').focus();
    };

    // Step 2: Phone
    phoneStep.querySelector('button').onclick = async (e) => {
      e.preventDefault();
      const phone = phoneStep.querySelector('input').value.trim();
      if (!phone) return;
      result.innerHTML = "";
      // Check phone
      const res = await fetch('/api/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.found) {
        result.innerHTML = '<span class="error">Phone already exists as a ' + data.where + '.</span>';
        return;
      }
      state.phone = phone;
      phoneStep.classList.add('hidden');
      addressStep.classList.remove('hidden');
      addressStep.querySelector('input').focus();
    };

    // Step 3: Address + Submit
    addressStep.querySelector('button').onclick = async (e) => {
      e.preventDefault();
      const address = addressStep.querySelector('input').value.trim();
      if (!address) return;
      result.innerHTML = "";
      // Create lead
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: state.email, phone: state.phone, address })
      });
      const data = await res.json();
      if (data.success) {
        result.innerHTML = '<span class="success">Lead created! ID: ' + data.id +
          '<br><a href="' + data.url + '" target="_blank">View in Splynx</a></span>';
        // Reset for next capture
        state = { email: "", phone: "", address: "" };
        form.reset();
        addressStep.classList.add('hidden');
        emailStep.classList.remove('hidden');
        emailStep.querySelector('input').focus();
      } else {
        result.innerHTML = '<span class="error">Error: ' + (data.error || 'Unknown') + '</span>';
      }
    };
  </script>
</body>
</html>
  `;
}
