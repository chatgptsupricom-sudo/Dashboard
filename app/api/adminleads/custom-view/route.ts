import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const STORAGE_DIR = path.join(process.cwd(), "uploads", "custom-views");
const HTML_FILE = path.join(STORAGE_DIR, "adminleads.html");
const META_FILE = path.join(STORAGE_DIR, "adminleads.meta.json");

async function ensureDir() {
  try {
    if (!existsSync(STORAGE_DIR)) await mkdir(STORAGE_DIR, { recursive: true });
  } catch (e: any) {
    console.error("ensureDir failed:", e.message);
  }
}

// GET — serve the stored HTML or a placeholder
export async function GET() {
  try {
    await ensureDir();

    if (!existsSync(HTML_FILE)) {
      return new Response(
        `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
        <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa;color:#64748b;}
        .box{text-align:center}.icon{font-size:64px;margin-bottom:16px}.title{font-size:22px;font-weight:600;margin-bottom:8px;color:#1e293b}
        p{font-size:14px}</style></head><body>
        <div class="box"><div class="icon">📄</div>
        <div class="title">Sin vista personalizada</div>
        <p>Sube un archivo HTML desde el panel para verlo aquí.</p></div>
        </body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const html = await readFile(HTML_FILE, "utf-8");
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "";
    const script = `<script>
(function(){
  var KEY='supricom_checks_al';
  var isRestoring=false;

  function keyOf(el,selector){
    if(el.id) return 'id|'+el.id;
    if(el.getAttribute('data-id')) return 'did|'+el.getAttribute('data-id');
    var txt=(el.textContent||'').trim().replace(/\\s+/g,' ').substring(0,80);
    var tag=el.tagName||'';
    var h=0;for(var i=0;i<txt.length;i++){h=((h<<5)-h)+txt.charCodeAt(i);h=h&h;}
    return tag+'|'+Math.abs(h)+'|'+txt.length;
  }

  function save(){
    if(isRestoring)return;
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
      var socketUrl='${socketUrl}';
      if(socketUrl){
        var script=document.createElement('script');
        script.src=socketUrl+'/socket.io/socket.io.js';
        script.onload=function(){
          try{
            var socket=io(socketUrl,{transports:['websocket']});
            socket.on('vista-checks-updated',function(payload){
              if(payload&&payload.checks)restore(payload.checks);
            });
          }catch(e){}
        };
        document.head.appendChild(script);
      }
    }
  })();
})();
</script>`;
    const finalScript = socketUrl ? script.replace("'__SOCKET_URL__'", `'${socketUrl}'`) : script;
    const injected = html.includes('</body>')
      ? html.replace('</body>', finalScript + '</body>')
      : html + finalScript;
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
    await ensureDir();

    const formData = await request.formData();
    const file = formData.get("html") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No se recibió archivo" }, { status: 400 });
    }

    const content = await file.text();
    if (!content.trim().toLowerCase().startsWith("<!doctype") && !content.trim().toLowerCase().startsWith("<html")) {
      return NextResponse.json({ success: false, error: "El archivo no parece ser un HTML válido" }, { status: 400 });
    }

    await writeFile(HTML_FILE, content, "utf-8");

    const meta = {
      updatedAt: new Date().toISOString(),
      filename: file.name,
      size: file.size,
    };
    await writeFile(META_FILE, JSON.stringify(meta), "utf-8");

    return NextResponse.json({ success: true, meta });
  } catch (error: any) {
    console.error("custom-view POST error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET /api/adminleads/custom-view/meta — metadata only
export async function HEAD() {
  if (!existsSync(META_FILE)) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, { status: 200 });
}
