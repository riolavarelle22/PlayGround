const $ = (id) => document.getElementById(id);

$('create').onclick = async () => {
  $('create').disabled = true;
  try {
    const r = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('name').value || 'my-app' }),
    });
    const j = await r.json();
    $('newkey').textContent = `KEY (copy now): ${j.key}\nID: ${j.id}\nQuota: ${j.quota} tokens`;
    $('key').value = j.key;
    $('snippet').textContent =
`curl http://localhost:3002/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${j.key}" \\
  -d '{"model":"anthracite-org/magnum-v4-72b","messages":[{"role":"user","content":"Hello"}]}'

// Python (OpenAI SDK)
from openai import OpenAI
client = OpenAI(base_url="http://localhost:3002/v1", api_key="${j.key}")
print(client.chat.completions.create(model="anthracite-org/magnum-v4-72b",
  messages=[{"role":"user","content":"Hello"}]).choices[0].message.content)`;
  } catch (e) {
    $('newkey').textContent = 'Error: ' + e.message;
  }
  $('create').disabled = false;
};

$('send').onclick = async () => {
  $('send').disabled = true;
  $('out').textContent = 'Sending...';
  try {
    const r = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + $('key').value.trim() },
      body: JSON.stringify({ model: 'anthracite-org/magnum-v4-72b', messages: [{ role: 'user', content: $('msg').value }] }),
    });
    $('out').textContent = JSON.stringify(await r.json(), null, 2);
  } catch (e) {
    $('out').textContent = 'Error: ' + e.message;
  }
  $('send').disabled = false;
};
