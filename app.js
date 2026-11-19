const fileInput=document.getElementById('fileInput');
const sourceList=document.getElementById('sourceList');
const sourceCount=document.getElementById('sourceCount');
const dropzone=document.getElementById('dropzone');
let sources=[];
function renderSources(){sourceCount.textContent=sources.length+' source'+(sources.length===1?'':'s');if(!sources.length){sourceList.innerHTML='<div class="empty-state">Your sources will appear here.</div>';return;}sourceList.innerHTML=sources.map((f,i)=>'<div class="source-item"><div class="file-icon">'+escapeHtml(f.ext)+'</div><div class="source-meta"><strong title="'+escapeHtml(f.name)+'">'+escapeHtml(f.name)+'</strong><small>'+formatSize(f.size)+'</small></div><button class="remove-source" data-index="'+i+'" aria-label="Remove source">×</button></div>').join('');}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatSize(n){return n<1024?n+' B':(n/1024).toFixed(1)+' KB';}
function addFiles(files){for(const f of files){const ext=f.name.split('.').pop().toUpperCase();if(!['PDF','TXT','MD','DOC','DOCX'].includes(ext)){alert('This file type is not supported yet: '+f.name);continue;}if(!sources.some(x=>x.name===f.name&&x.size===f.size))sources.push({name:f.name,size:f.size,ext});}renderSources();}
fileInput.addEventListener('change',e=>{addFiles(e.target.files);fileInput.value='';});
sourceList.addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(b){sources.splice(Number(b.dataset.index),1);renderSources();}});
dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.style.borderColor='#b18b58';});
dropzone.addEventListener('dragleave',()=>dropzone.style.borderColor='');
dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.style.borderColor='';addFiles(e.dataTransfer.files);});
const notes=document.getElementById('researchNotes');notes.value=localStorage.getItem('paciana-notes')||'';
let saveTimer;notes.addEventListener('input',()=>{document.getElementById('saveStatus').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{localStorage.setItem('paciana-notes',notes.value);document.getElementById('saveStatus').textContent='Saved in this browser';},350);});
document.querySelectorAll('.suggestion').forEach(b=>b.addEventListener('click',()=>{document.getElementById('questionInput').value=b.textContent;}));
document.getElementById('sendQuestion').addEventListener('click',()=>{const q=document.getElementById('questionInput').value.trim();if(!q)return;const box=document.getElementById('chatMessages');const p=document.createElement('p');p.textContent='Your question: '+q;box.appendChild(p);const note=document.createElement('p');note.textContent='The AI research backend is not connected yet. Your question has not been sent to an AI service. The next development stage will connect a secure API and source-grounded retrieval.';note.style.color='#8b765b';box.appendChild(note);document.getElementById('questionInput').value='';});
document.getElementById('newNotebook').addEventListener('click',()=>{const name=prompt('Name your notebook:');if(!name||!name.trim())return;const b=document.createElement('button');b.className='notebook-link';b.innerHTML='<span class="notebook-dot"></span><span></span>';b.querySelector('span:last-child').textContent=name.trim();document.getElementById('notebookList').appendChild(b);document.getElementById('currentNotebook').textContent=name.trim();document.querySelectorAll('.notebook-link').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');});
renderSources();