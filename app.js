const fileInput=document.getElementById('fileInput');
const sourceList=document.getElementById('sourceList');
const sourceCount=document.getElementById('sourceCount');
const dropzone=document.getElementById('dropzone');
const chatMessages=document.getElementById('chatMessages');
const questionInput=document.getElementById('questionInput');
const sendButton=document.getElementById('sendQuestion');
let sources=[];
let busy=false;
const MAX_FILE_BYTES=50*1024*1024;
const MAX_CHAT_CHUNKS=30;
const MAX_CHAT_CHARS=105000;

const SOURCE_DB_NAME='paciana-source-library-v1';
let sourceDbPromise;
function openSourceDb(){if(!('indexedDB' in window))return Promise.reject(new Error('Penyimpanan dokumen besar tidak didukung browser ini.'));if(!sourceDbPromise)sourceDbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open(SOURCE_DB_NAME,1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('notebookSources'))db.createObjectStore('notebookSources');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});return sourceDbPromise;}
async function storeNotebookSources(id,value){const db=await openSourceDb();return new Promise((resolve,reject)=>{const tx=db.transaction('notebookSources','readwrite');tx.objectStore('notebookSources').put(value,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function readNotebookSources(id){try{const db=await openSourceDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('notebookSources','readonly');const req=tx.objectStore('notebookSources').get(id);req.onsuccess=()=>resolve(Array.isArray(req.result)?req.result:[]);req.onerror=()=>reject(req.error);});}catch(error){console.warn(error);return [];}}
function renderSources(){
  sourceCount.textContent=sources.length+' sumber';
  if(!sources.length){sourceList.innerHTML='<div class="empty-state">Sumber Anda akan muncul di sini.</div>';return;}
  sourceList.innerHTML=sources.map((f,i)=>'<div class="source-item"><div class="file-icon">'+escapeHtml(f.ext)+'</div><div class="source-meta"><strong title="'+escapeHtml(f.name)+'">'+escapeHtml(f.name)+'</strong><small>'+formatSize(f.size)+' · '+f.chunks.length+' bagian teks</small><div class="source-actions"><button type="button" data-source-action="view" data-index="'+i+'">Lihat isi</button><button type="button" data-source-action="copy" data-index="'+i+'">Salin teks</button></div></div><button class="remove-source" data-remove-index="'+i+'" aria-label="Hapus sumber">×</button></div>').join('');
}
const sourceViewer=document.getElementById('sourceViewer');
const sourceViewerTitle=document.getElementById('sourceViewerTitle');
const sourceViewerText=document.getElementById('sourceViewerText');
function openSourceViewer(name,text){
  sourceViewerTitle.textContent=name;
  sourceViewerText.value=text;
  sourceViewer.hidden=false;
  sourceViewerText.scrollTop=0;
}
function closeSourceViewer(){sourceViewer.hidden=true;}
async function copySourceText(text){
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return;}
  const temporary=document.createElement('textarea');
  temporary.value=text;temporary.style.position='fixed';temporary.style.opacity='0';
  document.body.appendChild(temporary);temporary.select();
  const copied=document.execCommand('copy');temporary.remove();
  if(!copied)throw new Error('Clipboard tidak tersedia');
}
document.getElementById('closeSourceViewer').addEventListener('click',closeSourceViewer);
document.getElementById('copyViewerText').addEventListener('click',async()=>{
  try{await copySourceText(sourceViewerText.value);document.getElementById('viewerStatus').textContent='Teks berhasil disalin.';}
  catch(error){document.getElementById('viewerStatus').textContent='Tidak dapat menyalin otomatis. Pilih teks lalu salin secara manual.';}
});
sourceViewer.addEventListener('click',e=>{if(e.target===sourceViewer)closeSourceViewer();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!sourceViewer.hidden)closeSourceViewer();});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatSize(n){return n<1024?n+' B':(n/1024).toFixed(1)+' KB';}
function splitText(text,page=null){
  const chunks=[];const clean=text.replace(/\u0000/g,'').trim();const size=3500;
  for(let i=0;i<clean.length;i+=size){const part=clean.slice(i,i+size).trim();if(part)chunks.push({page,text:part});}
  return chunks;
}
let ocrWorkerPromise=null;
async function getOcrWorker(){
  if(!window.Tesseract)throw new Error('Modul OCR gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.');
  if(!ocrWorkerPromise){
    ocrWorkerPromise=window.Tesseract.createWorker('eng',1,{
      logger:message=>{
        if(message.status==='recognizing text'){
          const percent=Math.round((message.progress||0)*100);
          document.getElementById('sourceStatus').textContent='OCR sedang mengenali teks… '+percent+'%';
        }
      }
    });
  }
  return ocrWorkerPromise;
}
async function recognizePdfPage(page,pageNumber){
  const viewport=page.getViewport({scale:1.6});
  const canvas=document.createElement('canvas');
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  const context=canvas.getContext('2d',{willReadFrequently:true});
  await page.render({canvasContext:context,viewport}).promise;
  const worker=await getOcrWorker();
  const result=await worker.recognize(canvas);
  canvas.width=0;canvas.height=0;
  return (result.data.text||'').trim();
}
async function extractFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='txt'||ext==='md'){return splitText(await file.text());}
  if(ext==='pdf'){
    if(!window.pdfjsLib)throw new Error('Pembaca PDF gagal dimuat. Muat ulang halaman lalu coba lagi.');
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const chunks=[];
    let ocrPages=0;
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);const content=await page.getTextContent();
      let text=content.items.map(x=>x.str||'').join(' ').trim();
      // OCR only pages without a usable text layer; preserve selectable text on other pages.
      if(text.replace(/\\s/g,'').length<20){
        ocrPages++;
        document.getElementById('sourceStatus').textContent='Mengenali halaman '+p+' dari '+pdf.numPages+' dengan OCR…';
        text=await recognizePdfPage(page,p);
      }
      chunks.push(...splitText(text,p));
    }
    if(ocrPages)document.getElementById('sourceStatus').textContent='OCR selesai pada '+ocrPages+' halaman. Menyiapkan sumber…';
    return chunks;
  }
  if(['png','jpg','jpeg','webp','bmp','tif','tiff'].includes(ext)){
    const worker=await getOcrWorker();document.getElementById('sourceStatus').textContent='Mengenali teks pada gambar dengan OCR…';
    const result=await worker.recognize(file);return splitText((result.data.text||'').trim(),1);
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
    if(!['pdf','txt','md','docx','doc','png','jpg','jpeg','webp','bmp','tif','tiff'].includes(ext)){alert('Jenis berkas tidak didukung: '+file.name);continue;}
    if(file.size>MAX_FILE_BYTES){alert(file.name+' melebihi batas 15 MB per berkas.');continue;}
    if(sources.some(x=>x.name===file.name&&x.size===file.size))continue;
    const status=document.getElementById('sourceStatus');status.textContent='Mengekstrak '+file.name+'…';
    try{
      const chunks=await extractFile(file);
      if(!chunks.length){alert('PACIANA belum berhasil mengenali teks dalam '+file.name+'. Periksa kualitas pemindaian atau gunakan PDF yang lebih jelas.');continue;}
      sources.push({name:file.name,size:file.size,ext:ext.toUpperCase(),chunks});
      renderSources();
      saveActiveNotebook();
    }catch(error){alert('Tidak dapat membaca '+file.name+': '+error.message);}
  }
  document.getElementById('sourceStatus').textContent=sources.length+' sumber siap digunakan untuk pertanyaan.';
}
fileInput.addEventListener('change',e=>{addFiles(e.target.files);fileInput.value='';});
sourceList.addEventListener('click',async e=>{
  const action=e.target.closest('[data-source-action]');
  if(action){
    const source=sources[Number(action.dataset.index)];
    if(!source)return;
    const fullText=source.chunks.map(c=>c.text).join('\n\n');
    if(action.dataset.sourceAction==='view')openSourceViewer(source.name,fullText);
    if(action.dataset.sourceAction==='copy'){
      try{await copySourceText(fullText);document.getElementById('sourceStatus').textContent='Teks '+source.name+' berhasil disalin.';}
      catch(error){openSourceViewer(source.name,fullText);document.getElementById('sourceStatus').textContent='Salin otomatis tidak tersedia. Pilih dan salin teks dari jendela dokumen.';}
    }
    return;
  }
  const remove=e.target.closest('[data-remove-index]');
  if(remove){sources.splice(Number(remove.dataset.removeIndex),1);renderSources();saveActiveNotebook();}
});
dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.style.borderColor='#b18b58';});
dropzone.addEventListener('dragleave',()=>dropzone.style.borderColor='');
dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.style.borderColor='';addFiles(e.dataTransfer.files);});

const notes=document.createElement('textarea');
let saveTimer;
const NOTEBOOKS_KEY='paciana-notebooks-v1';
let notebooks=[];
let activeNotebookId='';
function persistNotebooks(){
  try{localStorage.setItem(NOTEBOOKS_KEY,JSON.stringify(notebooks.map(({sources:ignored,...rest})=>rest)));}
  catch(error){console.warn('Could not save notebook metadata in this browser:',error);}
}
function saveActiveNotebook(){
  const active=notebooks.find(n=>n.id===activeNotebookId);
  if(!active)return;
  active.sources=[];
  storeNotebookSources(active.id,sources).catch(error=>{console.error(error);document.getElementById('sourceStatus').textContent='Penyimpanan dokumen gagal. Ruang penyimpanan browser mungkin penuh.';});
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
async function activateNotebook(id){
  if(busy||id===activeNotebookId)return;
  saveActiveNotebook();
  const target=notebooks.find(n=>n.id===id);
  if(!target)return;
  activeNotebookId=target.id;
  sources=Array.isArray(target.sources)&&target.sources.length?target.sources:await readNotebookSources(target.id);
  notes.value=target.notes||'';
  chatMessages.innerHTML=target.chatHTML||'';
  document.getElementById('currentNotebook').textContent=target.name;
  document.getElementById('sourceStatus').textContent=sources.length+' readable source(s) ready for questions.';
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
(async()=>{for(const notebook of notebooks){if(Array.isArray(notebook.sources)&&notebook.sources.length){await storeNotebookSources(notebook.id,notebook.sources);notebook.sources=[];}}sources=await readNotebookSources(activeNotebookId);renderSources();document.getElementById('sourceStatus').textContent=sources.length+' sumber siap digunakan untuk pertanyaan.';persistNotebooks();})();
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
function selectChunksForQuestion(question,allSources){
  const all=[];for(const source of allSources)for(const chunk of source.chunks||[])if(chunk&&typeof chunk.text==='string'&&chunk.text.trim())all.push({name:source.name,page:Number.isInteger(chunk.page)?chunk.page:null,text:chunk.text});
  const q=String(question||'').toLocaleLowerCase('id').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const overview=/(tentang\s+apa|apa\s+(isi|pokok|gagasan|tema|topik|inti)|ringkas|rangkum|overview|summari[sz]e|main\s+(idea|theme))/i.test(q);
  let chosen;
  if(overview){chosen=[];const stride=Math.max(1,Math.ceil(all.length/MAX_CHAT_CHUNKS));for(let i=0;i<all.length&&chosen.length<MAX_CHAT_CHUNKS;i+=stride)chosen.push(all[i]);if(all.length&&chosen[chosen.length-1]!==all[all.length-1]&&chosen.length<MAX_CHAT_CHUNKS)chosen.push(all[all.length-1]);}
  else{const words=[...new Set((q.match(/[\p{L}\p{N}]{3,}/gu)||[]))];chosen=all.map(c=>{const body=c.text.toLocaleLowerCase('id');let score=0;for(const w of words)if(body.includes(w))score++;return {...c,score};}).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,MAX_CHAT_CHUNKS);}
  const grouped=new Map();let total=0;
  for(const item of chosen){if(total>=MAX_CHAT_CHARS)break;const text=item.text.slice(0,Math.min(3500,MAX_CHAT_CHARS-total));if(!text)continue;if(!grouped.has(item.name))grouped.set(item.name,[]);grouped.get(item.name).push({page:item.page,text});total+=text.length;}
  return [...grouped.entries()].map(([name,chunks])=>({name,chunks}));
}
async function askQuestion(){
  const question=questionInput.value.trim();if(!question||busy)return;
  // Perintah dokumen diproses langsung dari teks lokal; tidak dikirim ke Gemini.
  const command=question.toLocaleLowerCase('id');
  const isDocumentCommand=/(tampilkan|lihat|buka|salin|masukkan|tambahkan).*(isi|teks).*(file|dokumen)/i.test(command);
  if(isDocumentCommand){
    const match=sources.find(s=>command.includes(s.name.toLocaleLowerCase('id')));
    const generic=/file itu|dokumen itu|isi file|isi dokumen|teks file|teks dokumen/.test(command);
    const source=match||(generic&&sources.length===1?sources[0]:null);
    if(!sources.length){addMessage('assistant','Belum ada dokumen yang diunggah. Unggah dokumen terlebih dahulu.');questionInput.value='';return;}
    if(!source){
      addMessage('assistant',sources.length>1?'Ada beberapa dokumen. Sebutkan nama file yang dimaksud, atau gunakan tombol “Lihat isi” pada dokumen.':'Saya belum dapat mengenali nama dokumen. Gunakan tombol “Lihat isi” pada sumber yang dimaksud.');
      questionInput.value='';return;
    }
    const fullText=source.chunks.map(c=>c.text).join('\n\n');
    addMessage('user',question);questionInput.value='';
    if(/salin/.test(command)){
      try{await copySourceText(fullText);addMessage('assistant','Teks lengkap '+source.name+' telah disalin ke clipboard.');}
      catch(error){openSourceViewer(source.name,fullText);addMessage('assistant','Silakan salin teks lengkap dokumen dari jendela yang terbuka.');}
    }else{
      openSourceViewer(source.name,fullText);
      addMessage('assistant','Saya membuka teks lengkap '+source.name+'. Teks ini berasal dari hasil ekstraksi lokal dokumen, bukan jawaban yang dihasilkan AI.');
    }
    return;
  }
  if(!sources.length){addMessage('assistant','Unggah setidaknya satu sumber yang dapat dibaca sebelum mengajukan pertanyaan.');return;}
  busy=true;sendButton.disabled=true;sendButton.textContent='…';questionInput.value='';addMessage('user',question);
  const loading=document.createElement('div');loading.className='chat-message assistant';loading.textContent='PACIANA sedang membaca bagian-bagian yang relevan…';chatMessages.appendChild(loading);
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,sources:selectChunksForQuestion(question,sources)})});
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


// Minimize/restore workspace panels. Minimized panels remain as vertical tabs at the left.
(function setupPanelMinimize(){
  const grid=document.querySelector('.workspace-grid');
  const panels={
    sources:document.getElementById('sources'),
    studio:document.querySelector('.studio-panel')
  };
  if(!grid||!panels.sources||!panels.studio)return;
  const key='paciana-minimized-panels-v1';
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch(_){}
  function apply(){
    Object.entries(panels).forEach(([name,panel])=>{
      const minimized=!!saved[name];
      panel.classList.toggle('is-minimized',minimized);
      const button=panel.querySelector('[data-panel-toggle]');
      if(button){
        button.textContent=minimized?'›':'‹';
        button.setAttribute('aria-expanded',String(!minimized));
        button.setAttribute('aria-label',(minimized?'Pulihkan ':'Minimalkan ')+(name==='sources'?'pustaka':'tanya paciana'));
        button.title=minimized?'Pulihkan panel':'Minimalkan panel';
      }
    });
    grid.classList.toggle('has-minimized',Object.values(saved).some(Boolean));
  }
  grid.addEventListener('click',event=>{
    const button=event.target.closest('[data-panel-toggle]');
    if(!button)return;
    const name=button.dataset.panelToggle;
    if(!(name in panels))return;
    saved[name]=!saved[name];
    try{localStorage.setItem(key,JSON.stringify(saved));}catch(_){}
    apply();
  });
  apply();
})();
