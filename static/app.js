const output = document.getElementById("output");
const targetEl = document.getElementById("target");
const verboseEl = document.getElementById("verbose");

function show(msg){ output.textContent = msg; }

async function postJSON(path, body){
  show("⏳ Running...");
  try{
    const res = await fetch(path, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(body)
    });
    const data = await res.json();
    show(JSON.stringify(data, null, 2));
  }catch(e){
    show("Request failed: "+e);
  }
}

document.getElementById("btn-http").addEventListener("click", ()=> {
  const url = targetEl.value.trim();
  if(!url){ show("enter a target"); return; }
  postJSON("/api/http", {url, timeout:10, verbose: verboseEl.checked});
});
document.getElementById("btn-port").addEventListener("click", ()=> {
  const value = targetEl.value.trim();
  if(!value){ show("enter host:port"); return; }
  let host = value; let port = 80;
  if(value.includes(":")){ const parts = value.split(":"); host = parts[0]; port = Number(parts[1]||80); }
  postJSON("/api/port", {host, port, timeout:5});
});
document.getElementById("btn-nmap").addEventListener("click", ()=> {
  const host = targetEl.value.trim();
  if(!host){ show("enter host"); return; }
  postJSON("/api/nmap", {host, top_ports:100, timeout:30});
});

