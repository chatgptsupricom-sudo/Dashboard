import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { canUploadCustomPlan, canViewCustomPlan, getAuthUser } from "@/lib/auth/customView";

declare global { var io: any; }

const VIEW_NAME = "adminleads";

async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS custom_views (
        id INT AUTO_INCREMENT PRIMARY KEY,
        view_name VARCHAR(100) NOT NULL UNIQUE,
        html_content LONGTEXT NOT NULL,
        filename VARCHAR(255),
        file_size INT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e: any) {
    console.error("ensureTable failed:", e.message);
  }
}

const PLACEHOLDER_HTML = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa;color:#64748b;}
.box{text-align:center}.icon{font-size:64px;margin-bottom:16px}.title{font-size:22px;font-weight:600;margin-bottom:8px;color:#1e293b}
p{font-size:14px}</style></head><body>
<div class="box"><div class="icon">&#128196;</div>
<div class="title">Sin vista personalizada</div>
<p>Sube un archivo HTML desde el panel para verlo aqui.</p></div>
</body></html>`;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "";

const CHECKS_SCRIPT = `<script>
(function(){
  var KEY='supricom_checks_al';
  var isRestoring=false;
  var _unloading=false;
  window.addEventListener('beforeunload',function(){_unloading=true;});

  function keyOf(el,selector){
    var anc=el.parentElement;
    while(anc&&!anc.id)anc=anc.parentElement;
    if(anc&&anc.id){
      var siblings=Array.from(anc.querySelectorAll(selector));
      var i=siblings.indexOf(el);
      if(i>=0)return anc.id+'|'+i;
    }
    return 'g|'+Array.from(document.querySelectorAll(selector)).indexOf(el);
  }

  function save(){
    if(isRestoring||_unloading)return;
    var s={};
    document.querySelectorAll('.piece').forEach(function(el){
      if(el.classList.contains('checked'))s[keyOf(el,'.piece')]=1;
    });
    document.querySelectorAll('.email-card').forEach(function(el){
      if(el.classList.contains('checked'))s[keyOf(el,'.email-card')]=1;
    });
    try{localStorage.setItem(KEY,JSON.stringify(s));}catch(e){}
    if(window.parent!==window){
      try{parent.postMessage({type:'SUPRICOM_CHECK_SAVE',checks:s},'*');}catch(e){}
    } else {
      try{
        fetch('/api/adminleads/custom-view/checks',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(s)
        }).catch(function(){});
      }catch(e){}
    }
  }

  function restore(s){
    isRestoring=true;
    document.querySelectorAll('.piece').forEach(function(el){
      el.classList.toggle('checked',!!s[keyOf(el,'.piece')]);
    });
    document.querySelectorAll('.email-card').forEach(function(el){
      el.classList.toggle('checked',!!s[keyOf(el,'.email-card')]);
    });
    setTimeout(function(){isRestoring=false;},150);
  }

  window.addEventListener('message',function(e){
    if(!e.data||e.data.type!=='SUPRICOM_CHECK_RESTORE')return;
    restore(e.data.checks||{});
  });

  var _orig=window.toggleCheck;
  window.toggleCheck=function(el,e){
    if(_orig)_orig.call(this,el,e);
    setTimeout(save,20);
  };

  (function(){
    var s;try{s=JSON.parse(localStorage.getItem(KEY)||'{}');}catch(e){s={};}
    if(Object.keys(s).length)restore(s);
    if(window.parent===window){
      fetch('/api/adminleads/custom-view/checks').then(function(r){return r.json();}).then(function(d){
        if(d.checks&&Object.keys(d.checks).length)restore(d.checks);
      }).catch(function(){});
      var socketUrl='${SOCKET_URL}'||window.location.origin;
      if(socketUrl){
        var sc=document.createElement('script');
        sc.src=socketUrl+'/socket.io/socket.io.js';
        sc.onload=function(){
          try{
            var socket=io(socketUrl,{transports:['websocket']});
            socket.on('vista-checks-updated',function(payload){
              if(payload&&payload.checks)restore(payload.checks);
            });
          }catch(e){}
        };
        document.head.appendChild(sc);
      }
    }
  })();
})();
</script>`;

// GET — serve the stored HTML or a placeholder
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return new Response("No autorizado", { status: 401 });
    }

    await ensureTable();

    const result = await query(
      `SELECT html_content FROM custom_views WHERE view_name = ?`,
      [VIEW_NAME]
    );
    const row = result.rows?.[0];

    if (!row?.html_content) {
      return new Response(PLACEHOLDER_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const html = row.html_content;
    const injected = html.includes("</body>")
      ? html.replace("</body>", CHECKS_SCRIPT + "</body>")
      : html + CHECKS_SCRIPT;

    return new Response(injected, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("custom-view GET error:", error.message);
    return new Response(
      `<!DOCTYPE html><html><body><h1>Error</h1><p>${error.message}</p></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

// POST — receive and save new HTML file
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canUploadCustomPlan(user)) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    await ensureTable();

    const formData = await request.formData();
    const file = formData.get("html") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No se recibio archivo" }, { status: 400 });
    }

    const content = await file.text();
    if (!content.trim().toLowerCase().startsWith("<!doctype") && !content.trim().toLowerCase().startsWith("<html")) {
      return NextResponse.json({ success: false, error: "El archivo no parece ser un HTML valido" }, { status: 400 });
    }

    const meta = {
      updatedAt: new Date().toISOString(),
      filename: file.name,
      size: file.size,
    };

    await query(
      `INSERT INTO custom_views (view_name, html_content, filename, file_size, updated_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE html_content = VALUES(html_content), filename = VALUES(filename), file_size = VALUES(file_size), updated_at = NOW()`,
      [VIEW_NAME, content, file.name, file.size]
    );

    if (global.io) {
      global.io.emit("vista-html-updated", { meta });
    }

    return NextResponse.json({ success: true, meta });
  } catch (error: any) {
    console.error("custom-view POST error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
