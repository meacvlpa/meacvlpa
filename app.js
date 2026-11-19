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
  sourceCount.textContent=sources.length+' source'+(sources.length===1?'':'s');
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
    if(!window.pdfjsLib)throw new Error('PDF reader did not load. Refresh the page and try again.');
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
    if(!window.mammoth)throw new Error('DOCX reader did not load. Refresh the page and try again.');
    const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
    return splitText(result.value);
  }
  if(ext==='doc')throw new Error('Legacy .doc files are not supported. Please save this document as .docx or PDF.');
  throw new Error('Unsupported file type.');
}
async function addFiles(files){
  for(const file of files){
    const ext=file.name.split('.').pop().toLowerCase();
    if(!['pdf','txt','md','docx','doc'].includes(ext)){alert('Unsupported file: '+file.name);continue;}
    if(file.size>MAX_FILE_BYTES){alert(file.name+' exceeds the 15 MB per-file limit.');continue;}
    if(sources.some(x=>x.name===file.name&&x.size===file.size))continue;
    const status=document.getElementById('sourceStatus');status.textContent='Extracting '+file.name+'…';
    try{
      const chunks=await extractFile(file);
      if(!chunks.length){alert('No selectable text was found in '+file.name+'. Scanned PDFs need OCR, which is not available yet.');continue;}
      sources.push({name:file.name,size:file.size,ext:ext.toUpperCase(),chunks});
      renderSources();
    }catch(error){alert('Could not read '+file.name+': '+error.message);}
  }
  document.getElementById('sourceStatus').textContent=sources.length+' readable source(s) ready for questions.';
}
fileInput.addEventListener('change',e=>{addFiles(e.target.files);fileInput.value='';});
sourceList.addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(b){sources.splice(Number(b.dataset.index),1);renderSources();}});
dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.style.borderColor='#b18b58';});
dropzone.addEventListener('dragleave',()=>dropzone.style.borderColor='');
dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.style.borderColor='';addFiles(e.dataTransfer.files);});

const notes=document.getElementById('researchNotes');notes.value=localStorage.getItem('paciana-notes')||'';
let saveTimer;notes.addEventListener('input',()=>{document.getElementById('saveStatus').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{localStorage.setItem('paciana-notes',notes.value);document.getElementById('saveStatus').textContent='Saved in this browser';},350);});
document.querySelectorAll('.suggestion').forEach(b=>b.addEventListener('click',()=>{questionInput.value=b.textContent;questionInput.focus();}));

function addMessage(role,text,evidence=[],verification=null){
  const wrap=document.createElement('div');wrap.className='chat-message '+role;
  const label=document.createElement('strong');label.textContent=role==='user'?'You':'PACIANA';
  const body=document.createElement('div');body.className='message-body';body.textContent=text;
  wrap.append(label,body);
  if(role==='assistant'&&Array.isArray(evidence)&&evidence.length){
    const proofBox=document.createElement('section');proofBox.className='evidence-box';
    const heading=document.createElement('strong');heading.className='evidence-heading';heading.textContent='Textual evidence — exact quote found in source';
    proofBox.appendChild(heading);
    evidence.forEach(item=>{
      const proof=document.createElement('blockquote');proof.className='evidence-quote';
      const quote=document.createElement('div');quote.textContent='“'+item.quote+'”';
      const meta=document.createElement('small');meta.textContent='['+item.marker+'] '+item.source+(item.page?' — p. '+item.page:' — page unavailable');
      proof.append(quote,meta);proofBox.appendChild(proof);
    });
    if(verification){
      const note=document.createElement('p');note.className='verification-note';
      note.textContent='Exact-quote check: '+verification.verified_claims+' claim(s) have quotations found in the supplied text. Claims without a matching quotation were excluded. Quote matching confirms textual presence; it does not by itself prove that an interpretation is correct.';
      proofBox.appendChild(note);
    }
    wrap.appendChild(proofBox);
  }
  chatMessages.appendChild(wrap);wrap.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function askQuestion(){
  const question=questionInput.value.trim();if(!question||busy)return;
  if(!sources.length){addMessage('assistant','Please upload at least one readable source before asking a question.');return;}
  const total=sources.reduce((n,s)=>n+s.chunks.reduce((m,c)=>m+c.text.length,0),0);
  if(total>MAX_TOTAL_CHARS){addMessage('assistant','Your selected sources contain too much text for one request. Remove some documents or use shorter files.');return;}
  busy=true;sendButton.disabled=true;sendButton.textContent='…';questionInput.value='';addMessage('user',question);
  const loading=document.createElement('div');loading.className='chat-message assistant';loading.textContent='PACIANA is reading the relevant passages…';chatMessages.appendChild(loading);
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,sources:sources.map(s=>({name:s.name,chunks:s.chunks}))})});
    const data=await response.json();loading.remove();
    if(!response.ok)throw new Error(data.error||'The request failed.');
    const answer=data.answer||'No answer was returned.';
    addMessage('assistant',answer,data.evidence||[],data.verification||null);
  }catch(error){loading.remove();addMessage('assistant','Unable to answer: '+error.message);}
  finally{busy=false;sendButton.disabled=false;sendButton.textContent='↑';}
}
sendButton.addEventListener('click',askQuestion);
questionInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();askQuestion();}});
document.getElementById('newNotebook').addEventListener('click',()=>{
  const name=prompt('Name your notebook:');if(!name||!name.trim())return;
  const b=document.createElement('button');b.className='notebook-link';b.innerHTML='<span class="notebook-dot"></span><span></span>';b.querySelector('span:last-child').textContent=name.trim();
  document.getElementById('notebookList').appendChild(b);document.getElementById('currentNotebook').textContent=name.trim();
  document.querySelectorAll('.notebook-link').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');
});
renderSources();
