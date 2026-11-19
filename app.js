const fileInput=document.getElementById('fileInput');
const sourceList=document.getElementById('sourceList');
const sourceCount=document.getElementById('sourceCount');
const dropzone=document.getElementById('dropzone');
const chatMessages=document.getElementById('chatMessages');
const questionInput=document.getElementById('questionInput');
const sendButton=document.getElementById('sendQuestion');
let sources=[];
let busy=false;
const MAX_FILE_BYTES=15*1024*1024;
const MAX_TOTAL_CHARS=100000;

function renderSources(){
  sourceCount.textContent=sources.length+' sumber';
  if(!sources.length){sourceList.innerHTML='<div class="empty-state">Your sources will appear here.</div>';return;}
  sourceList.innerHTML=sources.map((f,i)=>'<div class="source-item"><div class="file-icon">'+escapeHtml(f.ext)+'</div><div class="source-meta"><strong title="'+escapeHtml(f.name)+'">'+escapeHtml(f.name)+'</strong><small>'+formatSize(f.size)+' · '+f.chunks.length+' text segments</small></div><button class="remove-source" data-index="'+i+'" aria-label="Remove source">×</button></div>').join('');
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatSize(n){return n<1024?n+' B':(n/1024).toFixed(1)+' KB';}
function splitText(text,page=null){
  const chunks=[];const clean=text.replace(/\u0000/g,'').trim();const size=3500;
  for(let i=0;i<clean.length;i+=size){const part=clean.slice(i,i+size).trim();if(part)chunks.push({page,text:part});}
  return chunks;
}
async function extractFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='txt'||ext==='md'){return splitText(await file.text());}
  if(ext==='pdf'){
    if(!window.pdfjsLib)throw new Error('Pembaca PDF gagal dimuat. Muat ulang halaman lalu coba lagi.');
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const chunks=[];
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);const content=await page.getTextContent();
      const text=content.items.map(x=>x.str||'').join(' ');
      chunks.push(...splitText(text,p));
    }
    return chunks;
  }
  if(ext==='docx'){
    if(!window.mammoth)throw new Error('Pembaca DOCX gagal dimuat. Muat ulang halaman lalu coba lagi.');
    const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    return splitText(result.value);
  }
  if(ext==='doc')throw new Error('Berkas .doc lama tidak didukung. Simpan dokumen sebagai .docx atau PDF.');
  throw new Error('Jenis berkas tidak didukung.');
}
async function addFiles(files){
  for(const file of files){
    const ext=file.name.split('.').pop().toLowerCase();
    if(!['pdf','txt','md','docx','doc'].includes(ext)){alert('Jenis berkas tidak didukung: '+file.name);continue;}
    if(file.size>MAX_FILE_BYTES){alert(file.name+' melebihi batas 15 MB per berkas.');continue;}
    if(sources.some(x=>x.name===file.name&&x.size===file.size))continue;
    const status=document.getElementById('sourceStatus');status.textContent='Mengekstrak '+file.name+'…';
    try{
      const chunks=await extractFile(file);
      if(!chunks.length){alert('Tidak ditemukan teks yang dapat dipilih dalam '+file.name+'. PDF hasil pemindaian memerlukan OCR yang belum tersedia.');continue;}
      sources.push({name:file.name,size:file.size,ext:ext.toUpperCase(),chunks});
      renderSources();
      saveActiveNotebook();
    }catch(error){alert('Tidak dapat membaca '+file.name+': '+error.message);}
  }
  document.getElementById('sourceStatus').textContent=sources.length+' sumber siap digunakan untuk pertanyaan.';
}
fileInput.addEventListener('change',e=>{addFiles(e.target.files);fileInput.value='';});
sourceList.addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(b){sources.splice(Number(b.dataset.index),1);renderSources();saveActiveNotebook();}});
dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.style.borderColor='#b18b58';});
dropzone.addEventListener('dragleave',()=>dropzone.style.borderColor='');
dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.style.borderColor='';addFiles(e.dataTransfer.files);});

const notes=document.getElementById('researchNotes');
let saveTimer;
const NOTEBOOKS_KEY='paciana-notebooks-v1';
let notebooks=[];
let activeNotebookId='';
function persistNotebooks(){
  try{localStorage.setItem(NOTEBOOKS_KEY,JSON.stringify(notebooks));}
  catch(error){console.warn('Could not save notebook data in this browser:',error);}
}
function saveActiveNotebook(){
  const active=notebooks.find(n=>n.id===activeNotebookId);
  if(!active)return;
  active.sources=sources;
  active.notes=notes.value;
  active.chatHTML=chatMessages.innerHTML;
  persistNotebooks();
}
function renderNotebookList(){
  const list=document.getElementById('notebookList');
  list.innerHTML='';
  notebooks.forEach(notebook=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='notebook-link'+(notebook.id===activeNotebookId?' selected':'');
    button.dataset.notebookId=notebook.id;
    const dot=document.createElement('span');dot.className='notebook-dot';
    const label=document.createElement('span');label.textContent=notebook.name;
    button.append(dot,label);list.appendChild(button);
  });
}
function activateNotebook(id){
  if(busy||id===activeNotebookId)return;
  saveActiveNotebook();
  const target=notebooks.find(n=>n.id===id);
  if(!target)return;
  activeNotebookId=target.id;
  sources=Array.isArray(target.sources)?target.sources:[];
  notes.value=target.notes||'';
  chatMessages.innerHTML=target.chatHTML||'';
  document.getElementById('currentNotebook').textContent=target.name;
  document.getElementById('sourceStatus').textContent=sources.length+' readable source(s) ready for questions.';
  document.getElementById('saveStatus').textContent='Notes are saved in this browser.';
  renderSources();
  renderNotebookList();
  questionInput.value='';
  chatMessages.scrollTop=chatMessages.scrollHeight;
  persistNotebooks();
}
try{
  const saved=JSON.parse(localStorage.getItem(NOTEBOOKS_KEY)||'null');
  if(Array.isArray(saved))notebooks=saved.filter(n=>n&&typeof n.id==='string'&&typeof n.name==='string');
}catch(error){notebooks=[];}
if(!notebooks.length)notebooks=[{id:'pacianus-default',name:'Pacianus of Barcelona',sources:[],notes:'',chatHTML:''}];
activeNotebookId=notebooks[0].id;
notes.value=notebooks[0].notes||'';
document.getElementById('currentNotebook').textContent=notebooks[0].name;
renderNotebookList();
let saveTimerId;
notes.addEventListener('input',()=>{
  document.getElementById('saveStatus').textContent='Menyimpan…';
  clearTimeout(saveTimerId);
  saveTimerId=setTimeout(()=>{
    saveActiveNotebook();
    document.getElementById('saveStatus').textContent='Tersimpan di browser ini';
  },350);
});
document.querySelectorAll('.suggestion').forEach(b=>b.addEventListener('click',()=>{questionInput.value=b.textContent;questionInput.focus();}));

function addMessage(role,text,evidence=[],verification=null,retrieval=null){
  const wrap=document.createElement('div');wrap.className='chat-message '+role;
  const label=document.createElement('strong');label.textContent=role==='user'?'Anda':'PACIANA';
  const body=document.createElement('div');body.className='message-body';body.textContent=text;
  wrap.append(label,body);
  if(role==='assistant'&&Array.isArray(evidence)&&evidence.length){
    const proofBox=document.createElement('section');proofBox.className='evidence-box';
    const heading=document.createElement('strong');heading.className='evidence-heading';heading.textContent='Bukti tekstual — kutipan persis ditemukan dalam sumber';
    proofBox.appendChild(heading);
    evidence.forEach(item=>{
      const proof=document.createElement('blockquote');proof.className='evidence-quote';
      const quote=document.createElement('div');quote.textContent='“'+item.quote+'”';
      const meta=document.createElement('small');meta.textContent='['+item.marker+'] '+item.source+(item.page?' — p. '+item.page:' — page unavailable');
      proof.append(quote,meta);proofBox.appendChild(proof);
    });
    if(verification){
      const note=document.createElement('p');note.className='verification-note';
      note.textContent='Audit bukti: '+(verification.exact_quote_claims??verification.verified_claims??0)+' klaim cocok dengan kutipan persis; '+(verification.semantically_supported_claims??0)+' lolos pemeriksaan dukungan semantik terpisah; '+(verification.rejected_by_semantic_audit??0)+' ditolak karena dukungannya tidak memadai. Pemeriksaan semantik oleh AI merupakan pengaman, bukan pengganti pembacaan ilmiah atas sumber asli.';
      proofBox.appendChild(note);
    }
    if(retrieval){
      const retrievalNote=document.createElement('p');retrievalNote.className='verification-note';
      const modeLabels={hybrid_lexical_semantic:'Pencarian semantik + leksikal',lexical_fallback:'Pencarian leksikal (pencarian semantik sementara tidak tersedia)',lexical_only:'Pencarian leksikal saja',none:'Tidak ada pencarian'};
      retrievalNote.textContent='Penelusuran: '+(modeLabels[retrieval.mode]||retrieval.mode)+'. '+(retrieval.retrieved_chunks??0)+' bagian teks diberikan untuk penyusunan jawaban.';
      proofBox.appendChild(retrievalNote);
    }
    wrap.appendChild(proofBox);
  }
  chatMessages.appendChild(wrap);
  saveActiveNotebook();
  wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function askQuestion(){
  const question=questionInput.value.trim();if(!question||busy)return;
  if(!sources.length){addMessage('assistant','Unggah setidaknya satu sumber yang dapat dibaca sebelum mengajukan pertanyaan.');return;}
  const total=sources.reduce((n,s)=>n+s.chunks.reduce((m,c)=>m+c.text.length,0),0);
  if(total>MAX_TOTAL_CHARS){addMessage('assistant','Sumber yang dipilih memuat terlalu banyak teks untuk satu permintaan. Hapus beberapa dokumen atau gunakan berkas yang lebih pendek.');return;}
  busy=true;sendButton.disabled=true;sendButton.textContent='…';questionInput.value='';addMessage('user',question);
  const loading=document.createElement('div');loading.className='chat-message assistant';loading.textContent='PACIANA sedang membaca bagian-bagian yang relevan…';chatMessages.appendChild(loading);
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,sources:sources.map(s=>({name:s.name,chunks:s.chunks}))})});
    const data=await response.json();loading.remove();
    if(!response.ok)throw new Error(data.error||'Permintaan gagal.');
    const answer=data.answer||'Tidak ada jawaban yang dikembalikan.';
    addMessage('assistant',answer,data.evidence||[],data.verification||null,data.retrieval||null);
  }catch(error){loading.remove();addMessage('assistant','Tidak dapat menjawab: '+error.message);}
  finally{busy=false;sendButton.disabled=false;sendButton.textContent='↑';}
}
sendButton.addEventListener('click',askQuestion);
questionInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();askQuestion();}});
document.getElementById('notebookList').addEventListener('click',event=>{
  const button=event.target.closest('[data-notebook-id]');
  if(button)activateNotebook(button.dataset.notebookId);
});
document.getElementById('newNotebook').addEventListener('click',()=>{
  if(busy)return;
  const name=prompt('Beri nama notebook Anda:');
  if(!name||!name.trim())return;
  saveActiveNotebook();
  const notebook={id:'nb-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name:name.trim(),sources:[],notes:'',chatHTML:''};
  notebooks.push(notebook);
  persistNotebooks();
  activateNotebook(notebook.id);
});
renderSources();
persistNotebooks();


// Resizable layout: sidebar and source/studio split persist in this browser.
(function enableResizableLayout(){
  const shell=document.querySelector('.app-shell');
  const workspace=document.querySelector('.workspace-grid');
  const sidebarHandle=document.querySelector('[data-resize="sidebar"]');
  const columnsHandle=document.querySelector('[data-resize="columns"]');
  if(!shell||!workspace||!sidebarHandle||!columnsHandle)return;
  const studio=document.querySelector('.studio-panel');
  const savedStudioHeight=Number(localStorage.getItem('paciana-studio-height'));
  if(studio&&savedStudioHeight>=420&&savedStudioHeight<=window.innerHeight*.95)studio.style.height=savedStudioHeight+'px';
  if(studio&&'ResizeObserver' in window){
    let studioSaveFrame=0;
    new ResizeObserver(entries=>{
      const height=Math.round(entries[0].contentRect.height);
      if(height>=420&&height<=window.innerHeight*.95){
        cancelAnimationFrame(studioSaveFrame);
        studioSaveFrame=requestAnimationFrame(()=>localStorage.setItem('paciana-studio-height',String(height)));
      }
    }).observe(studio);
  }
  const savedSidebar=Number(localStorage.getItem('paciana-sidebar-width'));
  const savedSources=Number(localStorage.getItem('paciana-sources-percent'));
  if(savedSidebar>=190&&savedSidebar<=420)shell.style.setProperty('--paciana-sidebar-width',savedSidebar+'px');
  if(savedSources>=25&&savedSources<=65)workspace.style.setProperty('--paciana-source-fr',savedSources+'fr');
  function beginResize(event,type){
    if(window.matchMedia('(max-width:700px)').matches)return;
    event.preventDefault();
    const startX=event.clientX;
    const shellRect=shell.getBoundingClientRect();
    const gridRect=workspace.getBoundingClientRect();
    const startSidebar=parseFloat(getComputedStyle(shell).getPropertyValue('--paciana-sidebar-width'))||270;
    const currentCols=getComputedStyle(workspace).gridTemplateColumns.split(' ').map(parseFloat);
    const available=Math.max(1,gridRect.width-7);
    const startSource=currentCols[0]||available*.44;
    document.body.classList.add('is-resizing');
    function move(e){
      const delta=e.clientX-startX;
      if(type==='sidebar'){
        const width=Math.max(190,Math.min(420,startSidebar+delta));
        shell.style.setProperty('--paciana-sidebar-width',width+'px');
      }else{
        const width=Math.max(260,Math.min(available-320,startSource+delta));
        const pct=Math.max(25,Math.min(65,width/available*100));
        workspace.style.setProperty('--paciana-source-fr',pct+'fr');
        workspace.style.gridTemplateColumns='minmax(260px,'+pct+'fr) 7px minmax(320px,'+(100-pct)+'fr)';
      }
    }
    function end(){
      document.removeEventListener('pointermove',move);
      document.removeEventListener('pointerup',end);
      document.body.classList.remove('is-resizing');
      const sidebar=parseFloat(getComputedStyle(shell).getPropertyValue('--paciana-sidebar-width'));
      const cols=getComputedStyle(workspace).gridTemplateColumns.split(' ').map(parseFloat);
      const total=cols[0]+cols[2];
      if(Number.isFinite(sidebar))localStorage.setItem('paciana-sidebar-width',String(Math.round(sidebar)));
      if(total>0)localStorage.setItem('paciana-sources-percent',String(Math.round(cols[0]/total*100)));
    }
    document.addEventListener('pointermove',move);
    document.addEventListener('pointerup',end);
  }
  sidebarHandle.addEventListener('pointerdown',e=>beginResize(e,'sidebar'));
  columnsHandle.addEventListener('pointerdown',e=>beginResize(e,'columns'));
  [sidebarHandle,columnsHandle].forEach((handle,index)=>handle.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();
    const delta=e.key==='ArrowRight'?12:-12;
    if(index===0){
      const current=parseFloat(getComputedStyle(shell).getPropertyValue('--paciana-sidebar-width'))||270;
      const next=Math.max(190,Math.min(420,current+delta));
      shell.style.setProperty('--paciana-sidebar-width',next+'px');
      localStorage.setItem('paciana-sidebar-width',String(next));
    }else{
      const current=Number(localStorage.getItem('paciana-sources-percent'))||44;
      const next=Math.max(25,Math.min(65,current+delta/5));
      workspace.style.setProperty('--paciana-source-fr',next+'fr');
      workspace.style.gridTemplateColumns='minmax(260px,'+next+'fr) 7px minmax(320px,'+(100-next)+'fr)';
      localStorage.setItem('paciana-sources-percent',String(next));
    }
  }));
})();


// Appearance settings: light (day), dark (night), or follow device preference.
(function setupAppearance(){
  const select=document.getElementById('themeSelect');
  if(!select)return;
  const key='paciana-appearance';
  const saved=localStorage.getItem(key)||'light';
  function apply(value){
    const mode=value==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):value;
    document.body.dataset.theme=mode;
    select.value=value;
    localStorage.setItem(key,value);
  }
  apply(saved);
  select.addEventListener('change',()=>apply(select.value));
  if(window.matchMedia){
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change',()=>{if(select.value==='system')apply('system');});
  }
})();
