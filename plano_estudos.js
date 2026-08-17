// ---------- tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
  });
});

// ---------- revisão espaçada logic ----------
const STORAGE_KEY = 'srs-entries';
const INTERVALS = [1,3,7,15,30,45];
let entries = [];
let storageOk = true;

function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function addDays(dateStr, n){
  const d = new Date(dateStr+'T00:00:00');
  d.setDate(d.getDate()+n);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fmtDate(dateStr){
  const [y,m,d] = dateStr.split('-');
  return d+'/'+m+'/'+y;
}
function setStatus(msg, isErr){
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'status-msg' + (isErr ? ' err' : '');
}

async function loadEntries(){
  try{
    const user = auth.currentUser;
    if(!user) throw new Error("Usuário não autenticado");
    const docRef = doc(db, "revisoes_salvas", user.uid);
    const docSnap = await getDoc(docRef);
    if(docSnap.exists()){
      entries = docSnap.data().entries || [];
    } else {
      entries = [];
    }
    storageOk = true;
  }catch(e){
    console.error("Erro ao carregar do Firestore:", e);
    entries = [];
    storageOk = false;
    setStatus('Armazenamento indisponível nesta sessão — use exportar/importar backup para não perder o progresso.', true);
  }
}

async function saveEntries(){
  if(!storageOk) return;
  try{
    const user = auth.currentUser;
    if(!user) throw new Error("Usuário não autenticado");
    const docRef = doc(db, "revisoes_salvas", user.uid);
    await setDoc(docRef, { entries: entries });
  }catch(e){
    console.error("Erro ao salvar no Firestore:", e);
    storageOk = false;
    setStatus('Armazenamento falhou — faça backup exportado para não perder o progresso.', true);
  }
}

function intervalStatus(entry, interval){
  const key = 'd'+interval;
  if(entry.completed[key]) return 'done';
  const due = addDays(entry.studyDate, interval);
  const today = todayStr();
  if(due < today) return 'overdue';
  if(due === today) return 'due';
  return 'pending';
}

function render(){
  renderDue();
  renderHistory();
}

function renderDue(){
  const list = document.getElementById('dueList');
  let items = [];
  entries.forEach(entry=>{
    INTERVALS.forEach(interval=>{
      const st = intervalStatus(entry, interval);
      if(st==='due' || st==='overdue'){ items.push({entry, interval, st}); }
    });
  });
  items.sort((a,b)=> a.st==='overdue' && b.st!=='overdue' ? -1 : (b.st==='overdue' && a.st!=='overdue' ? 1 : 0));

  document.getElementById('dueBadge').textContent = items.length;
  document.getElementById('dueBadge').className = 'badge' + (items.length===0 ? ' count0' : '');

  if(items.length===0){
    list.innerHTML = '<div class="empty">Nada pendente hoje. Bom trabalho — volte amanhã.</div>';
    return;
  }
  list.innerHTML = items.map(it=>{
    const label = it.st==='overdue' ? 'atrasada' : 'hoje';
    return `<div class="due-item ${it.st}">
      <div class="due-left">
        <div class="due-subject">${it.entry.subject}</div>
        <div class="due-topic">${it.entry.topic}</div>
        <div class="due-meta">revisão de ${it.interval} dia(s) · estudado em ${fmtDate(it.entry.studyDate)} · ${label}</div>
      </div>
      <div class="chk-row">
        <label style="font-family:var(--mono);font-size:11px;cursor:pointer;">
          <input type="checkbox" onchange="markDone('${it.entry.id}', ${it.interval})"> feito
        </label>
      </div>
    </div>`;
  }).join('');
}

function renderHistory(){
  const body = document.getElementById('historyBody');
  const empty = document.getElementById('historyEmpty');
  if(entries.length===0){ body.innerHTML=''; empty.style.display='block'; return; }
  empty.style.display = 'none';
  const sorted = [...entries].sort((a,b)=> b.studyDate.localeCompare(a.studyDate));
  body.innerHTML = sorted.map(entry=>{
    const cells = INTERVALS.map(interval=>{
      const st = intervalStatus(entry, interval);
      return `<td><span class="interval-dot ${st}"></span></td>`;
    }).join('');
    return `<tr>
      <td>${fmtDate(entry.studyDate)}</td>
      <td>${entry.subject}</td>
      <td>${entry.topic}</td>
      ${cells}
      <td><button class="danger" onclick="deleteEntry('${entry.id}')">remover</button></td>
    </tr>`;
  }).join('');
}

window.markDone = async function(id, interval){
  const entry = entries.find(e=>e.id===id);
  if(!entry) return;
  entry.completed['d'+interval] = true;
  await saveEntries();
  render();
};

window.deleteEntry = async function(id){
  entries = entries.filter(e=>e.id!==id);
  await saveEntries();
  render();
};

document.getElementById('addForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const subject = document.getElementById('fSubject').value;
  const topic = document.getElementById('fTopic').value.trim();
  const dateVal = document.getElementById('fDate').value || todayStr();
  if(!topic) return;
  entries.push({
    id: Date.now()+'-'+Math.random().toString(36).slice(2,8),
    subject, topic, studyDate: dateVal,
    completed: {d1:false,d3:false,d7:false,d15:false,d30:false,d45:false}
  });
  document.getElementById('fTopic').value='';
  await saveEntries();
  render();
});

document.getElementById('exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(entries,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'revisao-espacada-backup.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importInput').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const text = await file.text();
  try{
    const imported = JSON.parse(text);
    if(Array.isArray(imported)){
      const existingIds = new Set(entries.map(x=>x.id));
      imported.forEach(item=>{ if(!existingIds.has(item.id)) entries.push(item); });
      await saveEntries();
      render();
      setStatus('Backup importado com sucesso.', false);
    }
  }catch(err){
    setStatus('Arquivo de backup inválido.', true);
  }
});

document.getElementById('fDate').value = todayStr();

async function initApp(){
  setStatus('Carregando...', false);
  await loadEntries();
  if(storageOk) setStatus('', false);
  render();
  await carregarCicloSemanal();
}

// 1. Importações via CDN (compatíveis direto com o navegador)
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
  import { getFirestore, collection, addDoc, getDocs, serverTimestamp, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
  import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

  // 2. Importando a configuração separada do Firebase
  import { firebaseConfig } from "./firebase-config.js";

  // 3. Inicialização dos Serviços
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app); // Opcional, para estatísticas de acesso
  const db = getFirestore(app); // Essencial: conecta ao banco de dados
  const auth = getAuth(app);

  // 4. Lógica de exemplo para Salvar e Ler dados
  // Substitua 'btn-salvar' pelo ID real do botão no seu HTML
  const btnSalvar = document.getElementById('btn-salvar');
  if (btnSalvar) {
    btnSalvar.addEventListener('click', async () => {
      try {
        const docRef = await addDoc(collection(db, "estudos"), {
          // Aqui você vai puxar os valores dos seus inputs do HTML
          materia: "Exemplo de Matéria", 
          tempo_minutos: 60,
          data: serverTimestamp()
        });
        console.log("Documento salvo com ID: ", docRef.id);
        alert("Salvo com sucesso!");
      } catch (error) {
        console.error("Erro ao salvar no Firestore: ", error);
      }
    });
  }

  // 5. Lógica de Autenticação
  let appInitialized = false;

  onAuthStateChanged(auth, (user) => {
    if (user) {
      document.getElementById('login-section').style.display = 'none';
      document.getElementById('app-wrap').style.display = 'block';
      if (!appInitialized) {
        initApp();
        appInitialized = true;
      }
    } else {
      document.getElementById('login-section').style.display = 'block';
      document.getElementById('app-wrap').style.display = 'none';
    }
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.textContent = 'Autenticando...';
    
    try {
      await signInWithEmailAndPassword(auth, email, password);
      errEl.textContent = '';
    } catch (error) {
      errEl.textContent = 'Credenciais inválidas ou erro ao fazer login.';
      console.error(error);
    }
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth);
  });

// =========================================================================
// LÓGICA DO CICLO SEMANAL (LEITURA E EDIÇÃO)
// =========================================================================

const cicloDocRef = doc(db, "configuracoes", "ciclo_semanal");

const cicloLeituraContainer = document.getElementById("ciclo-leitura");
const cicloEdicaoContainer = document.getElementById("ciclo-edicao");
const listaCicloLeitura = document.getElementById("lista-ciclo-leitura");
const btnEditarCiclo = document.getElementById("btn-editar-ciclo");
const btnCancelarCiclo = document.getElementById("btn-cancelar-ciclo");
const formCiclo = document.getElementById("form-ciclo");

const inputsCiclo = {
  segundaFeira: document.getElementById("input-segunda"),
  tercaFeira: document.getElementById("input-terca"),
  quartaFeira: document.getElementById("input-quarta"),
  quintaFeira: document.getElementById("input-quinta"),
  sextaFeira: document.getElementById("input-sexta"),
  sabado: document.getElementById("input-sabado"),
  domingo: document.getElementById("input-domingo")
};

let dadosCicloAtual = {};

window.carregarCicloSemanal = async function() {
  try {
    const docSnap = await getDoc(cicloDocRef);
    if (docSnap.exists()) {
      dadosCicloAtual = docSnap.data();
      
      listaCicloLeitura.innerHTML = `
        <div style="padding: 6px; border-bottom: 1px solid var(--line);"><strong>Segunda-feira:</strong> ${dadosCicloAtual.segundaFeira || '-'}</div>
        <div style="padding: 6px; border-bottom: 1px solid var(--line);"><strong>Terça-feira:</strong> ${dadosCicloAtual.tercaFeira || '-'}</div>
        <div style="padding: 6px; border-bottom: 1px solid var(--line);"><strong>Quarta-feira:</strong> ${dadosCicloAtual.quartaFeira || '-'}</div>
        <div style="padding: 6px; border-bottom: 1px solid var(--line);"><strong>Quinta-feira:</strong> ${dadosCicloAtual.quintaFeira || '-'}</div>
        <div style="padding: 6px; border-bottom: 1px solid var(--line);"><strong>Sexta-feira:</strong> ${dadosCicloAtual.sextaFeira || '-'}</div>
        <div style="padding: 6px; border-bottom: 1px solid var(--line);"><strong>Sábado:</strong> ${dadosCicloAtual.sabado || '-'}</div>
        <div style="padding: 6px;"><strong>Domingo:</strong> ${dadosCicloAtual.domingo || '-'}</div>
      `;
    } else {
      listaCicloLeitura.innerHTML = "<p>Nenhum ciclo configurado encontrado no banco.</p>";
    }
  } catch (error) {
    console.error("Erro ao carregar o ciclo semanal:", error);
    listaCicloLeitura.innerHTML = "<p>Erro ao carregar o ciclo.</p>";
  }
}

if (btnEditarCiclo) {
  btnEditarCiclo.addEventListener('click', () => {
    inputsCiclo.segundaFeira.value = dadosCicloAtual.segundaFeira || '';
    inputsCiclo.tercaFeira.value = dadosCicloAtual.tercaFeira || '';
    inputsCiclo.quartaFeira.value = dadosCicloAtual.quartaFeira || '';
    inputsCiclo.quintaFeira.value = dadosCicloAtual.quintaFeira || '';
    inputsCiclo.sextaFeira.value = dadosCicloAtual.sextaFeira || '';
    inputsCiclo.sabado.value = dadosCicloAtual.sabado || '';
    inputsCiclo.domingo.value = dadosCicloAtual.domingo || '';

    cicloLeituraContainer.style.display = 'none';
    cicloEdicaoContainer.style.display = 'block';
  });
}

if (btnCancelarCiclo) {
  btnCancelarCiclo.addEventListener('click', () => {
    cicloEdicaoContainer.style.display = 'none';
    cicloLeituraContainer.style.display = 'block';
  });
}

if (formCiclo) {
  formCiclo.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const novosDados = {
      segundaFeira: inputsCiclo.segundaFeira.value,
      tercaFeira: inputsCiclo.tercaFeira.value,
      quartaFeira: inputsCiclo.quartaFeira.value,
      quintaFeira: inputsCiclo.quintaFeira.value,
      sextaFeira: inputsCiclo.sextaFeira.value,
      sabado: inputsCiclo.sabado.value,
      domingo: inputsCiclo.domingo.value
    };

    try {
      await updateDoc(cicloDocRef, novosDados);
      
      cicloEdicaoContainer.style.display = 'none';
      cicloLeituraContainer.style.display = 'block';
      
      await carregarCicloSemanal();
      
      alert("Ciclo semanal salvo com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar ciclo:", error);
      alert("Erro ao salvar as configurações. Verifique o console.");
    }
  });
}
