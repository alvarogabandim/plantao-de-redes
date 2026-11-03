/* Plantão de Redes · motor.js (Fase 1)
 * Estado de todos os equipamentos + cálculo da rede camada por camada:
 *   L1 enlace/duplex → LACP → VLAN/trunk → STP por VLAN → L3 salto a salto
 *   (ACL do core, rotas, RPF, política e NAT do FortiGate)
 * + gerador de defeitos aleatórios e matriz de testes que valida o encerramento.
 * Sem dependências: roda no navegador (window.Motor) e no Node (require) para os testes. */
(function (raiz) {
'use strict';

/* ================= IPv4 ================= */
function ip2n(s){if(typeof s!=='string')return null;const p=s.trim().split('.');if(p.length!==4)return null;let n=0;for(const x of p){if(!/^\d{1,3}$/.test(x))return null;const v=+x;if(v>255)return null;n=n*256+v}return n}
function n2ip(n){n=n>>>0;return[n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.')}
const E=(a,b)=>(a&b)>>>0;
const ehIP=s=>ip2n(s)!==null;
function mascaraOk(m){const n=ip2n(m);if(n===null)return false;const i=(~n)>>>0;return((i+1)&i)===0}
function lenDe(m){const n=ip2n(m);let l=0;while(l<32&&((n>>>(31-l))&1))l++;return l}
function maskDe(l){return l===0?'0.0.0.0':n2ip((0xFFFFFFFF<<(32-l))>>>0)}
function naRede(ip,rede,mask){const a=ip2n(ip),r=ip2n(rede),m=ip2n(mask);if(a===null||r===null||m===null)return false;return E(a,m)===E(r,m)}
function redeDe(ip,mask){return n2ip(E(ip2n(ip),ip2n(mask)))}
function privado(ip){return naRede(ip,'10.0.0.0','255.0.0.0')||naRede(ip,'172.16.0.0','255.240.0.0')||naRede(ip,'192.168.0.0','255.255.0.0')||naRede(ip,'169.254.0.0','255.255.0.0')}
function casaCuringa(ip,base,cur){const a=ip2n(ip),b=ip2n(base),w=ip2n(cur);if(a===null||b===null||w===null)return false;const m=(~w)>>>0;return E(a,m)===E(b,m)}
function listaVlans(t){const out=new Set();for(const p of String(t).split(',')){const m=p.trim().match(/^(\d+)(?:-(\d+))?$/);if(!m)return null;const a=+m[1],b=m[2]?+m[2]:a;if(a<1||b>4094||b<a)return null;for(let v=a;v<=b;v++)out.add(v)}return[...out].sort((x,y)=>x-y)}
function vlansTxt(a){if(a==null)return'1-4094';if(!a.length)return'none';const s=[...a].sort((x,y)=>x-y),o=[];let i=0;while(i<s.length){let j=i;while(j+1<s.length&&s[j+1]===s[j]+1)j++;o.push(j>i?s[i]+'-'+s[j]:''+s[i]);i=j+1}return o.join(',')}
function rng(seed){let a=seed>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
const pick=(r,a)=>a[Math.floor(r()*a.length)];

/* ================= nomes de interface ================= */
function nomeLongo(n){if(n.startsWith('Gi'))return'GigabitEthernet'+n.slice(2);if(n.startsWith('Po'))return'Port-channel'+n.slice(2);return n}
function ordemPorta(n){if(n.startsWith('Gi'))return+n.split('/').pop();if(n.startsWith('Po'))return 1000+(+n.slice(2));if(n.startsWith('Vlan'))return 2000+(+n.slice(4));return 5000}
function normIf(s){s=String(s).toLowerCase().replace(/\s+/g,'');let m=s.match(/^(gigabitethernet|gigabit|gig|gi|g)(\d+\/\d+\/\d+)$/);if(m)return'Gi'+m[2];m=s.match(/^(port-channel|port|po)(\d+)$/);if(m)return'Po'+m[2];m=s.match(/^(vlan|vl)(\d+)$/);if(m)return'Vlan'+m[2];return null}

/* ================= equipamentos ================= */
const ehEp=d=>d.tipo==='pc'||d.tipo==='srv'||d.tipo==='med';
const ehSw=d=>d.tipo==='sw'||d.tipo==='l3';
function porta(o){return Object.assign({desc:'',mode:'access',vlan:1,allowed:null,native:1,shut:false,errdis:null,cg:null,speed:'auto',duplex:'auto',portfast:false,bpduguard:false,bpdufilter:false,ip:null,mask:null,aclIn:null,aclOut:null},o||{})}
function novoSwitch(id,nome,tipo,modelo,mac,nP,extras){const ifs={};for(let i=1;i<=nP;i++)ifs['Gi1/0/'+i]=porta();(extras||[]).forEach(i=>ifs['Gi1/0/'+i]=porta());return{id,nome,tipo,modelo,mac,ifs,vlans:{1:'default'},stpPrio:32768,svis:{},rotas:[],acls:{},dhcp:{},logs:[],naoSalvo:false,errRecov:false}}
function novoEp(id,nome,tipo,so,mac,nic,host,serv){return{id,nome,tipo,so,mac,nic:Object.assign({dhcp:false,ip:null,mask:null,gw:null,dns:null,dnsManual:null},nic),host,lease:null,liberado:false,servicos:serv||{},logs:[],linkAntes:false}}
const EXTERNOS={'google.com':'142.250.219.14','www.google.com':'142.250.219.14','dns.google':'8.8.8.8','gov.br':'161.148.164.31','www.gov.br':'161.148.164.31'};
const PORTA_EP={RECEP:['SW1A','Gi1/0/5'],FAT:['SW1A','Gi1/0/6'],TOMO:['SW3A','Gi1/0/5'],LAUDO:['SW3A','Gi1/0/6']};
const VLAN_EP={RECEP:20,FAT:10,TOMO:30,LAUDO:30};
const GW_VLAN={10:'10.10.10.1',20:'10.10.20.1',30:'10.10.30.1',100:'10.10.1.1'};
const NOME_VLAN={10:'ADMINISTRATIVO',20:'RECEPCAO',30:'IMAGEM',99:'QUARENTENA',100:'SERVIDORES'};

function criarRede(){
  const st={devs:{},links:[],relogio:0,sniff:[],fluxos:[],flowId:0,ver:0,term:{}};
  const D=st.devs;
  D.NET={id:'NET',nome:'INTERNET',tipo:'net',ifs:{wan:{ip:'200.160.2.1',mask:'255.255.255.252',status:'up'}},
    hosts:{'8.8.8.8':'dns.google','1.1.1.1':'one.one.one.one','142.250.219.14':'google.com','161.148.164.31':'gov.br'},
    servHosts:{'8.8.8.8':{udp:[53],tcp:[53,443]},'1.1.1.1':{udp:[53],tcp:[53,443]},'142.250.219.14':{tcp:[80,443]},'161.148.164.31':{tcp:[80,443]}},logs:[]};
  D.FGT={id:'FGT',nome:'FGT-HVC',tipo:'fw',modelo:'FortiGate 100F · FortiOS v7.4',
    ifs:{port1:{ip:'200.160.2.2',mask:'255.255.255.252',status:'up',alias:'WAN-OPERADORA',allow:'ping'},
         port2:{ip:'10.10.0.1',mask:'255.255.255.252',status:'up',alias:'LAN-CORE',allow:'ping https ssh'}},
    rotas:[{id:1,dst:'0.0.0.0',mask:'0.0.0.0',gw:'200.160.2.1',dev:'port1',status:true},
           {id:2,dst:'10.10.0.0',mask:'255.255.0.0',gw:'10.10.0.2',dev:'port2',status:true}],
    politicas:[{id:1,nome:'LAN-para-Internet',src:'port2',dst:'port1',srcaddr:'all',dstaddr:'all',action:'accept',nat:true,status:true,service:'ALL',schedule:'always'}],
    dns:'8.8.8.8',servicos:{tcp:[22,443]},logs:[]};

  const C=D.CORE=novoSwitch('CORE','CORE-01','l3','Catalyst 9300-24T','00a1.c0de.0001',12);
  C.stpPrio=4096;C.vlans={1:'default',10:'ADMINISTRATIVO',20:'RECEPCAO',30:'IMAGEM',99:'QUARENTENA',100:'SERVIDORES'};
  Object.assign(C.ifs,{
    'Gi1/0/1':porta({desc:'FGT-HVC port2',mode:'routed',ip:'10.10.0.2',mask:'255.255.255.252'}),
    'Gi1/0/2':porta({desc:'SW-1A Gi1/0/49',mode:'trunk',allowed:[10,20,30],cg:{n:1,mode:'active'}}),
    'Gi1/0/3':porta({desc:'SW-1A Gi1/0/50',mode:'trunk',allowed:[10,20,30],cg:{n:1,mode:'active'}}),
    'Gi1/0/4':porta({desc:'SW-3A Gi1/0/49',mode:'trunk',allowed:[10,20,30]}),
    'Gi1/0/10':porta({desc:'SRV-DNS',vlan:100,portfast:true}),
    'Gi1/0/11':porta({desc:'SRV-PACS',vlan:100,portfast:true}),
    'Po1':porta({desc:'SW-1A Po1',mode:'trunk',allowed:[10,20,30]})});
  const svi=ip=>({ip,mask:'255.255.255.0',shut:false,aclIn:null,aclOut:null});
  C.svis={10:svi('10.10.10.1'),20:svi('10.10.20.1'),30:svi('10.10.30.1'),100:svi('10.10.1.1')};
  C.rotas=[{rede:'0.0.0.0',mask:'0.0.0.0',nh:'10.10.0.1'}];
  C.dhcp={10:{gw:'10.10.10.1',mask:'255.255.255.0',dns:'10.10.1.10'},20:{gw:'10.10.20.1',mask:'255.255.255.0',dns:'10.10.1.10'},30:{gw:'10.10.30.1',mask:'255.255.255.0',dns:'10.10.1.10'}};
  C.servicos={tcp:[22]};

  const A=D.SW1A=novoSwitch('SW1A','SW-1A','sw','Catalyst 2960-X 48','00a1.c0de.1a00',12,[48,49,50]);
  A.vlans={1:'default',10:'ADMINISTRATIVO',20:'RECEPCAO',30:'IMAGEM',99:'QUARENTENA'};
  Object.assign(A.ifs,{
    'Gi1/0/5':porta({desc:'PC-RECEP01',vlan:20,portfast:true,bpduguard:true}),
    'Gi1/0/6':porta({desc:'PC-FAT02',vlan:10,portfast:true,bpduguard:true}),
    'Gi1/0/48':porta({desc:'SW-3A Gi1/0/50 backup',mode:'trunk',allowed:[10,20,30]}),
    'Gi1/0/49':porta({desc:'CORE-01 Gi1/0/2',mode:'trunk',allowed:[10,20,30],cg:{n:1,mode:'active'}}),
    'Gi1/0/50':porta({desc:'CORE-01 Gi1/0/3',mode:'trunk',allowed:[10,20,30],cg:{n:1,mode:'active'}}),
    'Po1':porta({desc:'CORE-01 Po1',mode:'trunk',allowed:[10,20,30]})});

  const B=D.SW3A=novoSwitch('SW3A','SW-3A','sw','Catalyst 2960-X 48','00a1.c0de.3a00',12,[48,49,50]);
  B.vlans={1:'default',10:'ADMINISTRATIVO',20:'RECEPCAO',30:'IMAGEM',99:'QUARENTENA'};
  Object.assign(B.ifs,{
    'Gi1/0/5':porta({desc:'TOMO-01',vlan:30,portfast:true,bpduguard:true}),
    'Gi1/0/6':porta({desc:'PC-LAUDO03',vlan:30,portfast:true,bpduguard:true}),
    'Gi1/0/49':porta({desc:'CORE-01 Gi1/0/4',mode:'trunk',allowed:[10,20,30]}),
    'Gi1/0/50':porta({desc:'SW-1A Gi1/0/48 backup',mode:'trunk',allowed:[10,20,30]})});

  D.RECEP=novoEp('RECEP','PC-RECEP01','pc','Windows 11 Pro','0050.56aa.2001',{dhcp:true},87);
  D.FAT=novoEp('FAT','PC-FAT02','pc','Windows 11 Pro','0050.56aa.1002',{dhcp:true},42);
  D.LAUDO=novoEp('LAUDO','PC-LAUDO03','pc','Windows 11 Pro','0050.56aa.3003',{dhcp:true},63);
  D.TOMO=novoEp('TOMO','TOMO-01','med','Console de rede do tomógrafo','0050.56aa.3050',{ip:'10.10.30.50',mask:'255.255.255.0',gw:'10.10.30.1',dns:'10.10.1.10'},50);
  D.DNS=novoEp('DNS','SRV-DNS','srv','Windows Server 2022','0050.56aa.0110',{ip:'10.10.1.10',mask:'255.255.255.0',gw:'10.10.1.1',dns:'127.0.0.1'},10,{udp:[53],tcp:[53,3389]});
  D.DNS.zona={'pacs.hvc.local':'10.10.1.20','srv-pacs.hvc.local':'10.10.1.20','dns.hvc.local':'10.10.1.10','srv-dns.hvc.local':'10.10.1.10','core-01.hvc.local':'10.10.0.2'};
  D.DNS.encaminhador='8.8.8.8';
  D.PACS=novoEp('PACS','SRV-PACS','srv','Windows Server 2022 · PACS','0050.56aa.0120',{ip:'10.10.1.20',mask:'255.255.255.0',gw:'10.10.1.1',dns:'10.10.1.10'},20,{tcp:[104,443,3389]});
  D.PACS.svcNomes={'PACS-DICOM':['tcp',104],'PACS-Web':['tcp',443],'TermService':['tcp',3389]};D.DNS.svcNomes={'DNS':['udp',53],'DNS-TCP':['tcp',53],'TermService':['tcp',3389]};

  const L=(a,ai,b,bi,x)=>st.links.push(Object.assign({a:[a,ai],b:[b,bi]},x||{}));
  L('NET','wan','FGT','port1');L('FGT','port2','CORE','Gi1/0/1');
  L('CORE','Gi1/0/2','SW1A','Gi1/0/49');L('CORE','Gi1/0/3','SW1A','Gi1/0/50');
  L('CORE','Gi1/0/4','SW3A','Gi1/0/49');L('SW1A','Gi1/0/48','SW3A','Gi1/0/50');
  L('CORE','Gi1/0/10','DNS','nic');L('CORE','Gi1/0/11','PACS','nic');
  L('SW1A','Gi1/0/5','RECEP','nic');L('SW1A','Gi1/0/6','FAT','nic');
  L('SW3A','Gi1/0/5','TOMO','nic');L('SW3A','Gi1/0/6','LAUDO','nic');
  atualizar(st,{boot:true});
  return st;
}

/* ================= camada 1 e 2 ================= */
function linkPorta(st){const m=new Map();st.links.forEach((L,ix)=>{m.set(L.a[0]+'|'+L.a[1],{ix,lado:'a',outro:L.b});m.set(L.b[0]+'|'+L.b[1],{ix,lado:'b',outro:L.a})});return m}
function estadoPorta(st,dev,ifn){const d=st.devs[dev];if(ehEp(d))return d.nicOff?'off':'up';if(d.tipo==='fw'||d.tipo==='net'){const i=d.ifs[ifn];return i&&i.status==='up'?'up':'off'}const p=d.ifs[ifn];if(!p)return'off';if(p.shut)return'disabled';if(p.errdis)return'err-disabled';return'up'}
function cfgFis(st,dev,ifn){const d=st.devs[dev];return ehSw(d)?d.ifs[ifn]:{speed:'auto',duplex:'auto'}}
function negociar(a,b){const sp=x=>x.speed==='auto'?null:+x.speed;const sa=sp(a),sb=sp(b);if(sa&&sb&&sa!==sb)return null;const spd=sa||sb||1000;const aa=a.duplex==='auto',ab=b.duplex==='auto';let dA,dB;
  if(aa&&ab){dA=dB='full'}else if(aa){dB=b.duplex;dA='half'}else if(ab){dA=a.duplex;dB='half'}else{dA=a.duplex;dB=b.duplex}
  return{spd,dA,dB,aA:aa,aB:ab,sA:!sa,sB:!sb}}
function cfgL2Igual(a,b){return a.mode===b.mode&&a.native===b.native&&vlansTxt(a.allowed)===vlansTxt(b.allowed)&&(a.mode!=='access'||a.vlan===b.vlan)}
function pv(st,dev,p){const d=st.devs[dev];if(ehEp(d))return{k:'E'};if(d.tipo==='fw'||d.tipo==='net')return{k:'R'};const c=d.ifs[p];if(c.mode==='routed')return{k:'R'};const ex=v=>d.vlans[v]!==undefined;
  if(c.mode==='access')return{k:'S',u:ex(c.vlan)?c.vlan:null,t:[],inativa:!ex(c.vlan)};
  const perm=(c.allowed?c.allowed:Object.keys(d.vlans).map(Number)).filter(ex);return{k:'S',u:perm.includes(c.native)?c.native:null,t:perm.filter(v=>v!==c.native)}}

function bidMenor(st,x,y,v){const a=st.devs[x].stpPrio+v,b=st.devs[y].stpPrio+v;if(a!==b)return a<b;return st.devs[x].mac<st.devs[y].mac}
function pid(p){return p.startsWith('Po')?64+(+p.slice(2)):+p.split('/').pop()}
function custoPorta(R,gi){const g=R.logicas[gi];if(g.links.length>=2)return 3;const n=R.link[g.links[0]].neg;return n&&n.spd===100?19:n&&n.spd===10?100:4}

function stpVlan(st,R,v,C){
  const devs=[...new Set(C.flatMap(c=>[c.A.dev,c.B.dev]))];
  const rc={},raizDe={},rp={},papel={},fwd=C.map(()=>false);const pend=new Set(devs);
  while(pend.size){let r=null;for(const d of pend)if(r===null||bidMenor(st,d,r,v))r=d;
    const dist={[r]:0},vis=new Set();
    for(;;){let u=null;for(const d of pend)if(!vis.has(d)&&dist[d]!==undefined&&(u===null||dist[d]<dist[u]))u=d;if(u===null)break;vis.add(u);
      for(const c of C){if(!c.part)continue;for(const[me,ot]of[[c.A,c.B],[c.B,c.A]]){if(me.dev!==u||ot.dev===u||!pend.has(ot.dev))continue;const nd=dist[u]+custoPorta(R,c.gi);if(dist[ot.dev]===undefined||nd<dist[ot.dev])dist[ot.dev]=nd}}}
    for(const d of vis){rc[d]=dist[d];raizDe[d]=r;pend.delete(d)}}
  for(const d of devs){if(raizDe[d]===d)continue;let best=null;
    C.forEach((c,i)=>{if(!c.part)return;for(const[me,ot]of[[c.A,c.B],[c.B,c.A]]){if(me.dev!==d||ot.dev===d)continue;
      const k={p:me.p,i,cost:rc[ot.dev]+custoPorta(R,c.gi),nb:ot.dev,np:pid(ot.p),mp:pid(me.p)};
      if(!best||k.cost<best.cost||(k.cost===best.cost&&(k.nb!==best.nb?bidMenor(st,k.nb,best.nb,v):(k.np!==best.np?k.np<best.np:k.mp<best.mp))))best=k}});
    rp[d]=best}
  const menor=(x,y)=>{if(rc[x.dev]!==rc[y.dev])return rc[x.dev]<rc[y.dev];if(x.dev!==y.dev)return bidMenor(st,x.dev,y.dev,v);return pid(x.p)<pid(y.p)};
  C.forEach((c,i)=>{const kA=c.A.dev+'|'+c.A.p,kB=c.B.dev+'|'+c.B.p;
    if(!c.part){papel[kA]={r:'Desg',s:'FWD'};papel[kB]={r:'Desg',s:'FWD'};fwd[i]=true;return}
    if(c.A.dev===c.B.dev){const lo=pid(c.A.p)<pid(c.B.p)?c.A:c.B,hi=lo===c.A?c.B:c.A;papel[lo.dev+'|'+lo.p]={r:'Desg',s:'FWD'};papel[hi.dev+'|'+hi.p]={r:'Back',s:'BLK'};return}
    const des=menor(c.A,c.B)?c.A:c.B,out=des===c.A?c.B:c.A;
    papel[des.dev+'|'+des.p]={r:'Desg',s:'FWD'};
    const ehR=!!(rp[out.dev]&&rp[out.dev].i===i&&rp[out.dev].p===out.p);
    papel[out.dev+'|'+out.p]=ehR?{r:'Root',s:'FWD'}:{r:'Altn',s:'BLK'};fwd[i]=ehR});
  return{raiz:raizDe,rc,rp,papel,fwd,devs};
}

function construirL2(st){
  const D=st.devs,R={giEdges:{},link:[],porta:{},po:{},adj:new Map(),seg:new Map(),stormSeg:new Set(),stormVlan:new Set(),stp:{},sviUp:{},epLink:{},logicas:[],lp:linkPorta(st)};
  const ps=(dev,p,v)=>{R.porta[dev+'|'+p]=v};
  const sws=Object.values(D).filter(ehSw);
  for(const d of sws)for(const[n,p]of Object.entries(d.ifs))ps(d.id,n,p.shut?'disabled':p.errdis?'err-disabled':'notconnect');
  st.links.forEach((L,ix)=>{
    const ea=estadoPorta(st,L.a[0],L.a[1]),eb=estadoPorta(st,L.b[0],L.b[1]);
    let up=ea==='up'&&eb==='up'&&!L.cortado,neg=null;
    if(up){neg=negociar(cfgFis(st,L.a[0],L.a[1]),cfgFis(st,L.b[0],L.b[1]));if(!neg)up=false}
    R.link[ix]={up,neg,lossy:!!(neg&&neg.dA!==neg.dB),lacp:null,fwd:new Set(),blk:new Set(),uso:false};
    for(const e of[L.a,L.b]){const d=D[e[0]];if(ehEp(d))R.epLink[d.id]=up;else if(ehSw(d)&&up)ps(d.id,e[1],'connected')}
  });
  /* LACP / EtherChannel */
  const cg=(dev,p)=>{const d=D[dev];return ehSw(d)&&d.ifs[p]?d.ifs[p].cg:null};
  const poC=(dev,n)=>D[dev].ifs['Po'+n];
  st.links.forEach((L,ix)=>{const A=cg(L.a[0],L.a[1]),B=cg(L.b[0],L.b[1]);if(!A&&!B)return;const lk=R.link[ix];
    const okA=!A||(!!poC(L.a[0],A.n)&&cfgL2Igual(D[L.a[0]].ifs[L.a[1]],poC(L.a[0],A.n)));
    const okB=!B||(!!poC(L.b[0],B.n)&&cfgL2Igual(D[L.b[0]].ifs[L.b[1]],poC(L.b[0],B.n)));
    const compat=!!(A&&B)&&((A.mode==='on')===(B.mode==='on'))&&!(A.mode==='passive'&&B.mode==='passive')&&okA&&okB;
    const est=(X,ok)=>{if(!X)return null;if(!lk.up)return'D';if(!ok)return's';if(compat)return'P';return X.mode==='on'?'P':'s'};
    lk.lacp={compat:compat&&lk.up,a:est(A,okA),b:est(B,okB),ia:!okA,ib:!okB};
    if(lk.lacp.a==='s')ps(L.a[0],L.a[1],'suspended');if(lk.lacp.b==='s')ps(L.b[0],L.b[1],'suspended')});
  for(const d of sws)for(const n of Object.keys(d.ifs).filter(x=>x.startsWith('Po'))){const num=+n.slice(2);
    const membros=Object.keys(d.ifs).filter(x=>!x.startsWith('Po')&&d.ifs[x].cg&&d.ifs[x].cg.n===num);
    const ativos=membros.filter(m=>{const lp=R.lp.get(d.id+'|'+m);if(!lp)return false;const lk=R.link[lp.ix];return!!(lk.lacp&&lk.lacp[lp.lado]==='P')});
    const up=!d.ifs[n].shut&&ativos.length>0;R.po[d.id+'|'+n]={up,membros,ativos};ps(d.id,n,d.ifs[n].shut?'disabled':up?'connected':'notconnect')}
  /* enlaces lógicos (Po conta como um só) */
  const grupos=new Map();
  st.links.forEach((L,ix)=>{const lk=R.link[ix];if(!lk.up)return;
    if(lk.lacp){if(!lk.lacp.compat)return;const A=cg(L.a[0],L.a[1]),B=cg(L.b[0],L.b[1]);const pa='Po'+A.n,pb='Po'+B.n;
      if(!R.po[L.a[0]+'|'+pa]||!R.po[L.a[0]+'|'+pa].up||!R.po[L.b[0]+'|'+pb]||!R.po[L.b[0]+'|'+pb].up)return;
      const k=L.a[0]+'|'+pa+'|'+L.b[0]+'|'+pb;if(!grupos.has(k))grupos.set(k,{a:{dev:L.a[0],p:pa},b:{dev:L.b[0],p:pb},links:[],lossy:false});
      const g=grupos.get(k);g.links.push(ix);g.lossy=g.lossy||lk.lossy;return}
    R.logicas.push({a:{dev:L.a[0],p:L.a[1]},b:{dev:L.b[0],p:L.b[1]},links:[ix],lossy:lk.lossy})});
  grupos.forEach(g=>R.logicas.push(g));
  const cands={},fixas=[];
  R.logicas.forEach((g,gi)=>{const va=pv(st,g.a.dev,g.a.p),vb=pv(st,g.b.dev,g.b.p);
    for(const[x,v]of[[g.a,va],[g.b,vb]])if(v.k==='S'&&v.inativa&&R.porta[x.dev+'|'+x.p]==='connected')ps(x.dev,x.p,'inactive');
    if(va.k==='S'&&vb.k==='S'){
      const fil=x=>!!D[x.dev].ifs[x.p].bpdufilter;const part=!(fil(g.a)||fil(g.b));
      const add=v=>(cands[v]=cands[v]||[]).push({gi,A:g.a,B:g.b,part});
      if(va.u!=null&&vb.u!=null){if(va.u===vb.u)add(va.u);else g.pvidInc=[va.u,vb.u]}
      va.t.forEach(v=>{if(vb.t.includes(v))add(v)});
    }else if((va.k==='S'&&vb.k==='E')||(va.k==='E'&&vb.k==='S')){const[s,sv,e]=va.k==='S'?[g.a,va,g.b]:[g.b,vb,g.a];if(sv.u!=null)fixas.push({n1:'E:'+e.dev,n2:'S:'+s.dev+':'+sv.u,gi,vlan:sv.u})}
    else if(va.k==='R'&&vb.k==='R')fixas.push({n1:'R:'+g.a.dev+':'+g.a.p,n2:'R:'+g.b.dev+':'+g.b.p,gi})});
  /* STP por VLAN + detecção de loop */
  const fwdE=[],stormNos=new Set();
  for(const v of Object.keys(cands).map(Number)){const Cv=cands[v];const res=stpVlan(st,R,v,Cv);res.cands=Cv;R.stp[v]=res;
    const uf=new Map();const f=x=>{while(uf.has(x))x=uf.get(x);return x};
    Cv.forEach((c,i)=>{const a='S:'+c.A.dev+':'+v,b='S:'+c.B.dev+':'+v;
      if(!res.fwd[i]){R.logicas[c.gi].links.forEach(ix=>R.link[ix].blk.add(v));return}
      fwdE.push({n1:a,n2:b,gi:c.gi,vlan:v});const ra=f(a),rb=f(b);if(ra===rb){stormNos.add(a);R.stormVlan.add(v)}else uf.set(ra,rb)})}
  R.logicas.forEach(g=>{if(g.pvidInc)g.links.forEach(ix=>{R.link[ix].blk.add(g.pvidInc[0])})});
  const add=e=>{(R.giEdges[e.gi]=R.giEdges[e.gi]||[]).push([e.n1,e.n2]);for(const[x,y]of[[e.n1,e.n2],[e.n2,e.n1]]){if(!R.adj.has(x))R.adj.set(x,[]);R.adj.get(x).push({to:y,gi:e.gi})}
    R.logicas[e.gi].links.forEach(ix=>{const lk=R.link[ix];lk.uso=true;if(e.vlan!=null)lk.fwd.add(e.vlan)})};
  fixas.forEach(add);fwdE.forEach(add);
  let sg=0;for(const n of R.adj.keys()){if(R.seg.has(n))continue;const q=[n];R.seg.set(n,sg);while(q.length){const x=q.pop();for(const e of R.adj.get(x)||[])if(!R.seg.has(e.to)){R.seg.set(e.to,sg);q.push(e.to)}}sg++}
  stormNos.forEach(n=>R.stormSeg.add(R.seg.get(n)));
  const C=D.CORE;if(C)for(const v in C.svis)R.sviUp[v]=!C.svis[v].shut&&C.vlans[v]!==undefined&&R.adj.has('S:CORE:'+v);
  return R;
}
function caminhoL2(L,de,para){if(de===para)return{nos:[de],gis:[]};const prev=new Map([[de,null]]);const q=[de];
  while(q.length){const x=q.shift();if(x===para)break;for(const e of L.adj.get(x)||[])if(!prev.has(e.to)){prev.set(e.to,{de:x,gi:e.gi});q.push(e.to)}}
  if(!prev.has(para))return null;const nos=[],gis=[];let x=para;while(x!==null){nos.unshift(x);const p=prev.get(x);if(!p)break;gis.unshift(p.gi);x=p.de}return{nos,gis}}

/* ================= IP dos equipamentos ================= */
function cfgIP(st,d){const n=d.nic;const up=st.l2?!!st.l2.epLink[d.id]:true;
  if(!n.dhcp)return{ip:n.ip,mask:n.mask,gw:n.gw,dns:n.dns,up,dhcp:false};
  if(d.lease)return{ip:d.lease.ip,mask:d.lease.mask,gw:d.lease.gw,dns:n.dnsManual||d.lease.dns,up,dhcp:true,lease:d.lease};
  return{ip:'169.254.'+(80+d.host%100)+'.'+((d.host*3)%250+2),mask:'255.255.0.0',gw:null,dns:n.dnsManual,up,dhcp:true,apipa:true}}
function portaDe(L,gi,dev){const lg=L.logicas[gi];return lg.a.dev===dev?lg.a.p:lg.b.p}
function confiavel(d,p){const c=d.ifs[p];if(!c)return false;if(c.trust)return true;if(p.startsWith('Po'))return false;return!!(c.cg&&d.ifs['Po'+c.cg.n]&&d.ifs['Po'+c.cg.n].trust)}
/* DHCP snooping: oferta só passa por porta confiável nos switches com snooping ligado na VLAN. Devolve até onde a oferta chega. */
function bloqueioSnoop(st,path){const L=st.l2;if(!path)return null;for(let k=1;k<path.nos.length;k++){const[t,dv,v]=path.nos[k].split(':');if(t!=='S')continue;const d=st.devs[dv];
  if(d.snoop&&d.snoop.on&&d.snoop.vlans.includes(+v)&&!confiavel(d,portaDe(L,path.gis[k-1],dv)))return{k,dev:dv,porta:portaDe(L,path.gis[k-1],dv)}}return null}
function ofertasDhcp(st,ep){const L=st.l2;const sg=L.seg.get('E:'+ep.id);const out=[];if(sg===undefined||L.stormSeg.has(sg))return out;const no='E:'+ep.id;
  for(const d of Object.values(st.devs))if(d.dhcpSrv&&L.seg.get('E:'+d.id)===sg){const path=caminhoL2(L,'E:'+d.id,no);out.push({v:null,pool:d.dhcpSrv,de:d.id,deNo:'E:'+d.id,path,bloq:bloqueioSnoop(st,path)})}
  const C=st.devs.CORE;for(const v in C.dhcp)if(L.sviUp[v]&&L.seg.get('S:CORE:'+v)===sg){const path=caminhoL2(L,'S:CORE:'+v,no);out.push({v:+v,pool:C.dhcp[v],de:'CORE',deNo:'S:CORE:'+v,path,bloq:bloqueioSnoop(st,path)})}
  return out}
function servidorDhcp(st,ep){return ofertasDhcp(st,ep).find(o=>!o.bloq)||null}
function instalarPirata(st){const D=st.devs;D.ROGUE=novoEp('ROGUE','DESCONHECIDO','srv','Roteador doméstico (sem acesso)','b0be.76aa.0001',{ip:'192.168.0.1',mask:'255.255.255.0',gw:null,dns:null},1);
  D.ROGUE.semAcesso=true;D.ROGUE.dhcpSrv={gw:'192.168.0.1',mask:'255.255.255.0',dns:'192.168.0.1'};Object.assign(D.SW1A.ifs['Gi1/0/7'],{vlan:20,portfast:true});
  st.links.push({a:['SW1A','Gi1/0/7'],b:['ROGUE','nic']})}
function concede(ep,s){const b=redeDe(s.pool.gw,s.pool.mask).split('.');if(s.v==null)b[3]=String(100+ep.host%100);else b[3]=String(ep.host);ep.lease={ip:b.join('.'),mask:s.pool.mask,gw:s.pool.gw,dns:s.pool.dns,vlan:s.v,servidor:s.pool.gw}}
function dhcp(st,boot){for(const ep of Object.values(st.devs))if(ehEp(ep)&&ep.nic.dhcp){
  const agora=!!st.l2.epLink[ep.id];const flap=agora&&!ep.linkAntes;ep.linkAntes=agora;if(!agora||ep.liberado)continue;
  if(boot||flap||!ep.lease){const s=servidorDhcp(st,ep);if(s)concede(ep,s);else ep.lease=null}}}
function renovar(st,ep,op){ep.liberado=false;const s=servidorDhcp(st,ep);
  if(capOn(st,op)){const xid=((ep.host*2654435761)^(st.cap.seq*40503))>>>0,no='E:'+ep.id,bc={src:'0.0.0.0',dst:'255.255.255.255',ttl:128,proto:'udp'};
    const cli=(t,x)=>({eth:'ip',src:ep.mac,dst:'ffff.ffff.ffff',ip:bc,l4:{udp:{sp:68,dp:67},dhcp:Object.assign({t,xid,mac:ep.mac,nome:ep.nome},x||{})}});
    const ofs=ofertasDhcp(st,ep);const corta=o=>o.bloq?{nos:o.path.nos.slice(0,o.bloq.k+1),gis:o.path.gis.slice(0,o.bloq.k)}:o.path;
    const yiDe=o=>{const b=redeDe(o.pool.gw,o.pool.mask).split('.');b[3]=String(o.v==null?100+ep.host%100:ep.host);return b.join('.')};
    const srvr=(o,t)=>{const yi=yiDe(o),p=o.pool;return{eth:'ip',src:o.v==null?st.devs[o.de].mac:macDe(st,'CORE','Vlan'+o.v),dst:ep.mac,ip:{src:p.gw,dst:yi,ttl:o.v==null?64:255,proto:'udp'},l4:{udp:{sp:67,dp:68},dhcp:{t,xid,mac:ep.mac,yi,srv:p.gw,mask:p.mask,router:p.gw,dns:p.dns,lease:o.v==null?7200:86400}}}};
    if(!s){capBcast(st,no,cli(1));ofs.forEach(o=>capUni(st,corta(o),srvr(o,2)));for(let i=0;i<3;i++)capBcast(st,no,cli(1))}
    else{capBcast(st,no,cli(1));ofs.forEach(o=>capUni(st,corta(o),srvr(o,2)));const yi=yiDe(s);capBcast(st,no,cli(3,{req:yi,srv:s.pool.gw}));capUni(st,s.path,srvr(s,5))}}
  if(op&&op.registrar)for(const o of ofertasDhcp(st,ep))if(o.bloq)log(st,o.bloq.dev,`%DHCP_SNOOPING-5-DHCP_SNOOPING_UNTRUSTED_PORT: DHCP_SNOOPING drop message on untrusted port, message type: DHCPOFFER, MAC sa: ${o.v==null?st.devs[o.de].mac:macDe(st,'CORE','Vlan'+o.v)}`);
  if(s){concede(ep,s);st.own=donos(st);return true}st.own=donos(st);return false}
function liberar(st,ep,op){if(capOn(st,op)&&ep.lease){const s=servidorDhcp(st,ep),c=ep.lease;if(s)capUni(st,caminhoL2(st.l2,'E:'+ep.id,'S:CORE:'+s.v),{eth:'ip',src:ep.mac,dst:macDe(st,'CORE','Vlan'+s.v),ip:{src:c.ip,dst:c.servidor,ttl:128,proto:'udp'},l4:{udp:{sp:68,dp:67},dhcp:{t:7,xid:(ep.host*977)>>>0,mac:ep.mac,ci:c.ip,srv:c.servidor}}})}
  ep.lease=null;ep.liberado=true;st.own=donos(st)}

function noDe(st,dev,ifn){const d=st.devs[dev];if(ehEp(d))return'E:'+dev;if(d.tipo==='l3'&&/^Vlan\d+$/.test(ifn))return'S:'+dev+':'+ifn.slice(4);return'R:'+dev+':'+ifn}
function ipDe(st,dev,ifn){const d=st.devs[dev];if(ehEp(d))return cfgIP(st,d).ip;if(/^Vlan/.test(ifn)){const s=d.svis[+ifn.slice(4)];return s&&s.ip}const i=d.ifs[ifn];return i&&i.ip}
function ifUp(st,dev,ifn){const lp=st.l2.lp.get(dev+'|'+ifn);return!!(lp&&st.l2.link[lp.ix].up)}
function donos(st){const m=new Map(),D=st.devs,L=st.l2;const put=(ip,dev,ifn)=>{if(ip&&!m.has(ip))m.set(ip,{dev,ifn,no:noDe(st,dev,ifn)})};
  for(const d of Object.values(D)){
    if(ehEp(d)){const c=cfgIP(st,d);if(c.up&&c.ip)put(c.ip,d.id,'nic')}
    else if(d.tipo==='l3'){for(const v in d.svis)if(L.sviUp[v])put(d.svis[v].ip,d.id,'Vlan'+v);for(const[n,p]of Object.entries(d.ifs))if(p.mode==='routed'&&p.ip&&L.porta[d.id+'|'+n]==='connected')put(p.ip,d.id,n)}
    else if(d.tipo==='fw'||d.tipo==='net'){for(const[n,i]of Object.entries(d.ifs))if(i.status==='up'&&ifUp(st,d.id,n))put(i.ip,d.id,n)}}
  return m}
function atualizar(st,op){op=op||{};st.l2=construirL2(st);dhcp(st,!!op.boot);st.own=donos(st);st.ver++;return st}

/* ================= camada 3 ================= */
function rotas(st,dev){const d=st.devs[dev],L=st.l2,out=[];
  const C=(ip,mask,ifn)=>{if(ip&&mask)out.push({rede:redeDe(ip,mask),mask,len:lenDe(mask),nh:null,ifn,t:'C'})};
  if(ehEp(d)){const c=cfgIP(st,d);if(c.up&&c.ip){C(c.ip,c.mask,'nic');if(c.gw)out.push({rede:'0.0.0.0',mask:'0.0.0.0',len:0,nh:c.gw,ifn:'nic',t:'S'})}return out}
  if(d.tipo==='l3'){for(const v in d.svis)if(L.sviUp[v])C(d.svis[v].ip,d.svis[v].mask,'Vlan'+v);
    for(const[n,p]of Object.entries(d.ifs))if(p.mode==='routed'&&p.ip&&L.porta[d.id+'|'+n]==='connected')C(p.ip,p.mask,n);
    const con=out.slice();for(const r of d.rotas){const c=con.find(x=>naRede(r.nh,x.rede,x.mask));if(c)out.push({rede:redeDe(r.rede,r.mask),mask:r.mask,len:lenDe(r.mask),nh:r.nh,ifn:c.ifn,t:'S'})}}
  if(d.tipo==='fw'){for(const[n,i]of Object.entries(d.ifs))if(i.status==='up'&&ifUp(st,dev,n))C(i.ip,i.mask,n);
    const con=out.slice();for(const r of d.rotas){if(!r.status||!r.dev||!r.gw)continue;const c=con.find(x=>x.ifn===r.dev&&naRede(r.gw,x.rede,x.mask));if(c)out.push({rede:redeDe(r.dst,r.mask),mask:r.mask,len:lenDe(r.mask),nh:r.gw,ifn:r.dev,t:'S',id:r.id})}}
  if(d.tipo==='net'&&ifUp(st,'NET','wan'))C(d.ifs.wan.ip,d.ifs.wan.mask,'wan');
  return out.sort((a,b)=>b.len-a.len)}
function lpm(rs,ip){return rs.find(r=>naRede(ip,r.rede,r.mask))||null}
function dono(st,dev,ip){if(ip==='127.0.0.1')return true;const o=st.own.get(ip);if(o&&o.dev===dev)return true;const d=st.devs[dev];return d.tipo==='net'&&!!d.hosts[ip]}
function aclIf(d,ifn,dir){if(/^Vlan/.test(ifn)){const s=d.svis[+ifn.slice(4)];return s&&(dir==='in'?s.aclIn:s.aclOut)}const p=d.ifs[ifn];return p&&(dir==='in'?p.aclIn:p.aclOut)}
function casaEnd(ip,x){return x.any?true:casaCuringa(ip,x.ip,x.wc)}
function aclPermite(d,nome,pk,ctx){const a=d.acls[nome];if(!a)return true;
  for(const e of[...a.regras].sort((x,y)=>x.seq-y.seq)){if(e.remark)continue;if(e.proto!=='ip'&&e.proto!==pk.proto)continue;if(e.porta&&(pk.proto==='icmp'||pk.porta!==e.porta))continue;
    if(casaEnd(pk.src,e.src)&&casaEnd(pk.dst,e.dst)){if(ctx&&ctx.contar)e.hits=(e.hits||0)+1;return e.acao==='permit'}}return false}
function servicoOk(st,d,pk,ing){if(pk.proto==='icmp'){if(d.tipo==='fw'&&ing)return d.ifs[ing].allow.includes('ping');return true}
  const s=d.tipo==='net'?(d.servHosts[pk.dst]||{}):(d.servicos||{});return(s[pk.proto]||[]).includes(pk.porta)}
function regSniff(st,ctx,ifn,dir,pk){if(!ctx.registrar)return;st.sniff.push({t:st.relogio,ifn,dir,src:pk.src,dst:pk.dst,proto:pk.proto,porta:pk.porta,rep:pk.rep});if(st.sniff.length>80)st.sniff.shift()}
function regFlow(st,ctx,msg,novo){if(!ctx.registrar)return;if(novo||!ctx.flow){ctx.flow={id:++st.flowId,linhas:[]};st.fluxos.push(ctx.flow);if(st.fluxos.length>12)st.fluxos.shift()}ctx.flow.linhas.push(msg)}
const PROTO_N={icmp:1,tcp:6,udp:17};

function viajar(st,orig,pk,ctx){
  const D=st.devs,L=st.l2;let dev=orig,ing=null;const trilha=[orig],gis=[],hops=[];let lossy=false;
  const fim=(ok,ex)=>Object.assign({ok,dev,ing,trilha,gis,hops,lossy,pk},ex||{});
  for(let passo=0;passo<40;passo++){
    const d=D[dev];
    if(d.tipo==='fw'&&pk.rep&&ing){const s=[...ctx.nat].reverse().find(s=>s.novo===pk.dst);if(s){regSniff(st,ctx,ing,'in',pk);pk.dst=s.orig;regFlow(st,ctx,`resposta da sessão existente: DNAT ${s.novo} -> ${s.orig}`,true)}}
    if(dono(st,dev,pk.dst)){
      if(d.tipo==='net'&&d.hosts[pk.dst]&&ing){pk.ttl--;if(pk.ttl<=0)return fim(false,{motivo:'ttl',ipResp:d.ifs.wan.ip});hops.push({dev,ip:pk.dst})}
      if(!pk.rep&&!servicoOk(st,d,pk,ing))return fim(false,{motivo:'recusado',entregue:dev});
      if(d.tipo==='fw'&&ing)regSniff(st,ctx,ing,'in',pk);
      return fim(true,{entregue:dev})}
    const rot=d.tipo==='l3'||d.tipo==='fw'||d.tipo==='net';
    if(rot&&ing){pk.ttl--;if(pk.ttl<=0)return fim(false,{motivo:'ttl',ipResp:ipDe(st,dev,ing)})}
    let nh,egIf,egNo;
    if(ehEp(d)){
      if(ing)return fim(false,{motivo:'naoroteia'});
      const c=cfgIP(st,d);if(!c.up)return fim(false,{motivo:'midia'});if(!c.ip)return fim(false,{motivo:'semip'});
      if(naRede(pk.dst,c.ip,c.mask))nh=pk.dst;else if(c.gw)nh=c.gw;else return fim(false,{motivo:'semgw'});
      egIf='nic';egNo='E:'+dev;
    }else if(d.tipo==='net'){
      if(ing&&privado(pk.src))return fim(false,{motivo:'naoroteavel'});
      if(naRede(pk.dst,'200.160.2.0','255.255.255.252')){nh=pk.dst;egIf='wan';egNo='R:NET:wan'}else return fim(false,{motivo:privado(pk.dst)?'naoroteavel':'semrota'});
    }else{
      const rs=rotas(st,dev);
      if(d.tipo==='l3'&&ing){const acl=aclIf(d,ing,'in');if(acl&&!aclPermite(d,acl,pk,ctx))return fim(false,{motivo:'acl',acl,dir:'in',ifn:ing})}
      if(d.tipo==='fw'&&ing&&!pk.rep){
        regSniff(st,ctx,ing,'in',pk);
        regFlow(st,ctx,`vd-root:0 received a packet(proto=${PROTO_N[pk.proto]}, ${pk.src}->${pk.dst}${pk.porta?':'+pk.porta:''}) from ${ing}.`,true);
        const rv=lpm(rs,pk.src);if(!rv||rv.ifn!==ing){regFlow(st,ctx,'reverse path check fail, drop');return fim(false,{motivo:'rpf'})}
      }
      const r=lpm(rs,pk.dst);if(!r){if(d.tipo==='fw'&&ing)regFlow(st,ctx,'no route to '+pk.dst+', drop');return fim(false,{motivo:'semrota'})}
      egIf=r.ifn;nh=r.nh||pk.dst;egNo=noDe(st,dev,egIf);
      if(d.tipo==='fw'&&ing){
        if(!pk.rep){regFlow(st,ctx,`find a route: flag=04000000 gw-${nh} via ${egIf}`);
          if(egIf!==ing){const pol=d.politicas.find(p=>p.status&&p.src===ing&&p.dst===egIf);
            if(!pol){regFlow(st,ctx,'Denied by forward policy check (policy 0)');return fim(false,{motivo:'politica',pol:0})}
            if(pol.action!=='accept'){regFlow(st,ctx,`Denied by forward policy check (policy ${pol.id})`);return fim(false,{motivo:'politica',pol:pol.id})}
            if(pol.nat){const novo=ipDe(st,dev,egIf);ctx.nat.push({orig:pk.src,novo,dst:pk.dst});regFlow(st,ctx,`Allowed by Policy-${pol.id}: SNAT`);regFlow(st,ctx,`SNAT ${pk.src}->${novo}`);pk.src=novo}
            else regFlow(st,ctx,`Allowed by Policy-${pol.id}:`)}}
        else regFlow(st,ctx,`find a route: gw-${nh} via ${egIf}`);
        regSniff(st,ctx,egIf,'out',pk)}
      if(d.tipo==='l3'){const acl=aclIf(d,egIf,'out');if(acl&&!aclPermite(d,acl,pk,ctx))return fim(false,{motivo:'acl',acl,dir:'out',ifn:egIf})}
    }
    const o=st.own.get(nh);const sgE=L.seg.get(egNo);
    if(!o||o.dev===dev||sgE===undefined||L.seg.get(o.no)!==sgE){if(capOn(st,ctx)&&sgE!==undefined)capBcast(st,egNo,arpPergunta(st,dev,egIf,nh));return fim(false,{motivo:'arp',nh,egIf})}
    if(L.stormSeg.has(sgE))return fim(false,{motivo:'tempestade',nh,egIf});
    const p=caminhoL2(L,egNo,o.no);if(!p)return fim(false,{motivo:'arp',nh,egIf});
    if(ctx.registrar){const ac=arpCache(st),k=dev+'|'+nh;const om=macDe(st,o.dev,o.ifn);
      if(!ac[k]){if(capOn(st,ctx)){const q=arpPergunta(st,dev,egIf,nh);capBcast(st,egNo,q);capUni(st,caminhoL2(L,o.no,egNo),{eth:'arp',src:om,dst:q.src,arp:{op:2,sha:om,spa:nh,tha:q.src,tpa:q.arp.spa}})}ac[k]=1;ac[o.dev+'|'+ipDe(st,dev,egIf)]=1}
      if(capOn(st,ctx))capUni(st,p,{eth:'ip',src:macDe(st,dev,egIf),dst:om,ip:{src:pk.src,dst:pk.dst,ttl:pk.ttl,proto:pk.proto},l4:pk.l4||null})}
    for(const gi of p.gis){gis.push(gi);if(L.logicas[gi].lossy)lossy=true}
    for(let k=1;k<p.nos.length;k++){const dv=p.nos[k].split(':')[1];if(trilha[trilha.length-1]!==dv)trilha.push(dv)}
    hops.push({dev:o.dev,ip:ipDe(st,o.dev,o.ifn)});dev=o.dev;ing=o.ifn;
  }
  return fim(false,{motivo:'loop'});
}
function ipOrigem(st,dev,dst){const d=st.devs[dev];if(ehEp(d)){const c=cfgIP(st,d);return c.up?c.ip:null}if(d.tipo==='net')return d.ifs.wan.ip;const r=lpm(rotas(st,dev),dst);return r?ipDe(st,dev,r.ifn):null}
function ttlIni(d,ip){if(d.tipo==='net'&&d.hosts[ip])return 120;if(d.tipo==='pc'||d.tipo==='srv')return 128;if(d.tipo==='med')return 64;return 255}

/* ---------- captura de quadros: só tráfego disparado pelo usuário e só com a captura gravando ---------- */
function macDe(st,dev,ifn){const d=st.devs[dev];if(ehEp(d))return d.mac;if(/^Vlan/.test(ifn||''))return'00a1.c0de.00'+(+ifn.slice(4)).toString(16).padStart(2,'0');if(d.tipo==='l3')return'00a1.c0de.0101';if(d.tipo==='fw')return ifn==='port1'?'0009.0f09.0001':'0009.0f09.0002';if(d.tipo==='net')return'e8b7.4801.0001';return d.mac}
const capOn=(st,ctx)=>!!(ctx&&ctx.registrar&&st.cap&&st.cap.ativo);
function capRec(st,base,gi,par){const cap=st.cap,L=st.l2;const lg=L.logicas[gi];if(!lg||!lg.links.includes(cap.ix)||cap.frames.length>=3000)return;
  let vlan=null;const[a,b]=par;if(a.startsWith('S:')&&b.startsWith('S:')){const[,dv,v]=a.split(':');const lado=lg.a.dev===dv?lg.a:lg.b;const p=st.devs[dv].ifs[lado.p];if(p&&p.mode==='trunk'&&+v!==p.native)vlan=+v}
  const fr=JSON.parse(JSON.stringify(base));fr.t=st.relogio+(cap.seq++)*0.00037;fr.vlan=vlan;cap.frames.push(fr)}
function capUni(st,path,base){if(!path)return;path.gis.forEach((gi,k)=>capRec(st,base,gi,[path.nos[k],path.nos[k+1]]))}
function capBcast(st,deNo,base){const L=st.l2;const sg=L.seg.get(deNo);if(sg===undefined||L.stormSeg.has(sg))return;
  for(const gi of Object.keys(L.giEdges)){const par=L.giEdges[gi].find(([x])=>L.seg.get(x)===sg);if(par)capRec(st,base,+gi,par)}}
function arpCache(st){if(st.arpVer!==st.ver){st.arp={};st.arpVer=st.ver}return st.arp}
function arpPergunta(st,dev,egIf,nh){const sm=macDe(st,dev,egIf);return{eth:'arp',src:sm,dst:'ffff.ffff.ffff',arp:{op:1,sha:sm,spa:ipDe(st,dev,egIf),tha:'0000.0000.0000',tpa:nh}}}
let XID=0x3a17;const novoId=()=>(XID=(XID*1103+12345)&0xffff);

/* resolve nome → IP usando o DNS configurado no equipamento (pacote vai e volta de verdade) */
function resolver(st,de,nome,op){op=op||{};nome=String(nome).toLowerCase().replace(/\.$/,'');
  if(ehIP(nome))return{ok:true,ip:nome};
  const d=st.devs[de];const srv=op.servidor||(ehEp(d)?cfgIP(st,d).dns:d.tipo==='fw'?d.dns:null);
  if(!srv)return{ok:false,motivo:'semdns'};
  const nomeSrv=srv==='10.10.1.10'?'dns.hvc.local':srv==='8.8.8.8'?'dns.google':srv==='127.0.0.1'?'localhost':'UnKnown';
  const reg=!!op.registrar;const ctx={nat:[],registrar:reg,contar:reg};const id=novoId(),sp=49152+(id%16000);let srvDev,ida;
  if(srv==='127.0.0.1')srvDev=de;else{const src=ipOrigem(st,de,srv);if(!src)return{ok:false,motivo:'timeout',srv,nomeSrv};
    ida=viajar(st,de,{src,dst:srv,ttl:ttlIni(d),rep:false,proto:'udp',porta:53,l4:{udp:{sp,dp:53},dns:{id,q:nome,resp:false}}},ctx);
    if(!ida.ok)return{ok:false,motivo:ida.motivo==='recusado'?'recusado':'timeout',srv,nomeSrv,ida};srvDev=ida.entregue}
  const S=st.devs[srvDev];const base={srv,nomeSrv};let res;
  if(S.zona){if(S.zona[nome])res={ok:true,ip:S.zona[nome]};else if(nome.endsWith('.hvc.local'))res={ok:false,motivo:'nx'};
    else{const fsrc=cfgIP(st,S).ip;const c2={nat:[],registrar:reg};const fid=novoId(),fsp=53000+(fid%9000),fa=EXTERNOS[nome]||null;
      const f=viajar(st,srvDev,{src:fsrc,dst:S.encaminhador,ttl:128,rep:false,proto:'udp',porta:53,l4:{udp:{sp:fsp,dp:53},dns:{id:fid,q:nome,resp:false}}},c2);
      if(!f.ok||!viajar(st,f.entregue,{src:S.encaminhador,dst:f.pk.src,ttl:120,rep:true,proto:'udp',l4:{udp:{sp:53,dp:fsp},dns:{id:fid,q:nome,resp:true,rcode:fa?0:3,a:fa}}},c2).ok)res={ok:false,motivo:'servfail'};
      else res=fa?{ok:true,ip:fa,naoAut:true}:{ok:false,motivo:'nx'}}}
  else if(S.tipo==='net')res=EXTERNOS[nome]?{ok:true,ip:EXTERNOS[nome],naoAut:true}:{ok:false,motivo:'nx'};
  else return Object.assign({ok:false,motivo:'timeout'},base);
  if(ida){const rc=res.ok?0:res.motivo==='servfail'?2:3;
    const volta=viajar(st,srvDev,{src:srv,dst:ida.pk.src,ttl:ttlIni(S,srv),rep:true,proto:'udp',l4:{udp:{sp:53,dp:sp},dns:{id,q:nome,resp:true,rcode:rc,a:res.ok?res.ip:null}}},ctx);
    if(!volta.ok||volta.entregue!==de)return{ok:false,motivo:'timeout',srv,nomeSrv}}
  return Object.assign(res,base)}

function ping(st,de,alvo,op){op=op||{};const d=st.devs[de];const r={de,alvo,ip:null,nome:null};
  if(ehEp(d)&&!cfgIP(st,d).up)return Object.assign(r,{tipo:'midia'});
  if(!ehIP(alvo)){const q=resolver(st,de,alvo,op);if(!q.ok)return Object.assign(r,{tipo:'nome',dns:q});r.ip=q.ip;r.nome=String(alvo).toLowerCase()}else r.ip=alvo;
  const src=ipOrigem(st,de,r.ip);if(!src)return Object.assign(r,{tipo:'semrota_local'});r.src=src;
  const ctx={nat:[],registrar:!!op.registrar,contar:!!op.registrar};const seq=op.seq||1;
  const ida=viajar(st,de,{src,dst:r.ip,ttl:ttlIni(d),rep:false,proto:'icmp',l4:{icmp:{t:8,code:0,id:1,seq}}},ctx);r.ida=ida;r.trilha=ida.trilha;
  if(!ida.ok){
    if(ehEp(d)&&ida.dev===de&&(ida.motivo==='arp'||ida.motivo==='semgw'))return Object.assign(r,{tipo:'inac',deIp:src});
    if(ida.motivo==='semrota'&&ida.dev!==de){const ip=ipDe(st,ida.dev,ida.ing);const v=viajar(st,ida.dev,{src:ip,dst:ida.pk.src,ttl:255,rep:true,proto:'icmp',l4:{icmp:{t:3,code:0,orig:{src:ida.pk.src,dst:ida.pk.dst,ttl:ida.pk.ttl,id:1,seq}}}},ctx);if(v.ok)return Object.assign(r,{tipo:'rede_inac',deIp:ip})}
    if(ida.motivo==='semrota'&&ida.dev===de)return Object.assign(r,{tipo:'semrota_local'});
    return Object.assign(r,{tipo:'timeout'})}
  if(op.perde)return Object.assign(r,{tipo:'timeout'});
  const dd=st.devs[ida.entregue];
  const volta=viajar(st,ida.entregue,{src:r.ip,dst:ida.pk.src,ttl:ttlIni(dd,r.ip),rep:true,proto:'icmp',l4:{icmp:{t:0,code:0,id:1,seq}}},ctx);r.volta=volta;
  if(!volta.ok||volta.entregue!==de)return Object.assign(r,{tipo:'timeout'});
  r.ttl=volta.pk.ttl;r.lossy=ida.lossy||volta.lossy;
  const inet=st.devs[ida.entregue].tipo==='net';r.ms=Math.max(1,Math.round((ida.hops.length+volta.hops.length)/2))+(inet?11:0)+(r.lossy?40:0);
  r.tipo='ok';return r}

function conectar(st,de,alvo,porta,op){op=op||{};const d=st.devs[de];const r={de,alvo,porta};
  if(ehEp(d)&&!cfgIP(st,d).up)return Object.assign(r,{ok:false,motivo:'midia'});
  if(!ehIP(alvo)){const q=resolver(st,de,alvo,op);if(!q.ok)return Object.assign(r,{ok:false,motivo:'nome'});r.ip=q.ip}else r.ip=alvo;
  const src=ipOrigem(st,de,r.ip);if(!src)return Object.assign(r,{ok:false,motivo:'semrota'});r.src=src;
  const reg=!!op.registrar;const ctx={nat:[],registrar:reg,contar:reg},c2={nat:ctx.nat,registrar:reg};
  const id=novoId(),sp=49152+(id%16000),isn=(id*2654435761)>>>0,isn2=((id+porta)*40503*7919)>>>0;
  const syn=retr=>({src,dst:r.ip,ttl:ttlIni(d),rep:false,proto:'tcp',porta,l4:{tcp:{sp,dp:porta,flags:'S',seq:isn,ack:0,retr}}});
  const ida=viajar(st,de,syn(false),ctx);r.trilha=ida.trilha;
  if(!ida.ok){
    if(ida.motivo==='recusado'&&reg)viajar(st,ida.entregue,{src:r.ip,dst:ida.pk.src,ttl:128,rep:true,proto:'tcp',l4:{tcp:{sp:porta,dp:sp,flags:'RA',seq:0,ack:isn+1}}},c2);
    else if(capOn(st,ctx)){viajar(st,de,syn(true),c2);viajar(st,de,syn(true),c2)}
    return Object.assign(r,{ok:false,motivo:ida.motivo,ida})}
  if(ida.lossy&&capOn(st,ctx))viajar(st,de,syn(true),c2);
  const v=viajar(st,ida.entregue,{src:r.ip,dst:ida.pk.src,ttl:128,rep:true,proto:'tcp',l4:{tcp:{sp:porta,dp:sp,flags:'SA',seq:isn2,ack:(isn+1)>>>0}}},ctx);
  if(v.ok&&v.entregue===de&&capOn(st,ctx))viajar(st,de,{src,dst:r.ip,ttl:ttlIni(d),rep:false,proto:'tcp',porta,l4:{tcp:{sp,dp:porta,flags:'A',seq:(isn+1)>>>0,ack:(isn2+1)>>>0}}},c2);
  const vok=v.ok&&v.entregue===de;return Object.assign(r,{ok:vok,motivo:vok?null:'timeout',lossy:ida.lossy||v.lossy})}

function traceroute(st,de,alvo,op){op=op||{};const d=st.devs[de];const r={de,alvo,linhas:[]};
  if(ehEp(d)&&!cfgIP(st,d).up)return Object.assign(r,{tipo:'midia'});
  if(!ehIP(alvo)){const q=resolver(st,de,alvo,op);if(!q.ok)return Object.assign(r,{tipo:'nome',dns:q});r.ip=q.ip;r.nome=String(alvo).toLowerCase()}else r.ip=alvo;
  const src=ipOrigem(st,de,r.ip);if(!src)return Object.assign(r,{tipo:'semrota_local'});
  let vazios=0;
  for(let t=1;t<=30;t++){const ctx={nat:[],registrar:!!op.registrar};const x=viajar(st,de,{src,dst:r.ip,ttl:t,rep:false,proto:'icmp',l4:{icmp:{t:8,code:0,id:1,seq:t}}},ctx);let h=null,fim=false;
    const orig={src:x.pk.src,dst:x.pk.dst,ttl:1,id:1,seq:t};
    if(x.ok){const v=viajar(st,x.entregue,{src:r.ip,dst:x.pk.src,ttl:255,rep:true,proto:'icmp',l4:{icmp:{t:0,code:0,id:1,seq:t}}},ctx);if(v.ok){h={ip:r.ip};fim=true}}
    else if(x.motivo==='ttl'){const v=viajar(st,x.dev,{src:x.ipResp,dst:x.pk.src,ttl:255,rep:true,proto:'icmp',l4:{icmp:{t:11,code:0,orig}}},ctx);if(v.ok)h={ip:x.ipResp}}
    else if(x.motivo==='semrota'&&x.dev!==de){const ip=ipDe(st,x.dev,x.ing);const v=viajar(st,x.dev,{src:ip,dst:x.pk.src,ttl:255,rep:true,proto:'icmp',l4:{icmp:{t:3,code:0,orig}}},ctx);if(v.ok){h={ip,flag:'N'};fim=true}}
    else if((x.motivo==='arp'||x.motivo==='semgw')&&x.dev===de){h={ip:src,flag:'H'};fim=true}
    if(h){h.ms=t;r.linhas.push(h);vazios=0}else{r.linhas.push(null);vazios++}
    if(fim)break;if(vazios>=3){r.cortado=true;break}}
  const full=viajar(st,de,{src,dst:r.ip,ttl:64,rep:false,proto:'icmp'},{nat:[]});r.trilha=full.trilha;r.okFinal=full.ok;
  r.tipo='ok';return r}

/* ================= condições e matriz de testes ================= */
const COND={
  po1:st=>{const a=st.l2.po['CORE|Po1'],b=st.l2.po['SW1A|Po1'];return!!(a&&b&&a.up&&b.up&&a.ativos.length===2&&b.ativos.length===2&&st.links.filter((L,ix)=>st.l2.link[ix].lacp&&st.l2.link[ix].lacp.compat).length>=2)},
  storm:st=>st.l2.stormSeg.size===0,
  perda:st=>!st.l2.link.some(l=>l.up&&l.lossy),
  errdis:st=>!Object.values(PORTA_EP).some(([d,p])=>st.devs[d].ifs[p].errdis),
  raiz:st=>Object.values(st.l2.stp).every(r=>Object.values(r.raiz).every(x=>x==='CORE')),
};
const COND_EXTRA={semPirata:st=>{const R=st.devs.ROGUE;if(!R)return true;return!st.l2.epLink.ROGUE||!st.l2.seg.has('E:ROGUE')||st.l2.seg.get('E:ROGUE')!==st.l2.seg.get('S:CORE:20')||!!(ofertasDhcp(st,st.devs.RECEP).find(o=>o.de==='ROGUE')||{}).bloq},
  snoop:st=>{const A=st.devs.SW1A;if(!(A.snoop&&A.snoop.on&&A.snoop.vlans.includes(20)))return false;const o=ofertasDhcp(st,st.devs.RECEP);const pir=o.find(x=>x.de==='ROGUE');return!!(pir&&pir.bloq)&&!!o.find(x=>x.de==='CORE'&&!x.bloq)}};
const COND_DESC={raiz:'CORE-01 é a raiz do STP em todas as VLANs',semPirata:'Nenhum servidor DHCP não autorizado atendendo a VLAN 20',snoop:'DHCP snooping ativo na VLAN 20 do SW-1A, bloqueando o pirata e confiando no uplink',po1:'Port-channel1 com os 2 links agregados nos dois lados',storm:'Nenhuma tempestade de broadcast (loop) na rede',perda:'Nenhum link com erro de duplex / perda de pacotes',errdis:'Nenhuma porta de usuário em err-disabled'};
function matriz(){const T=[];
  for(const id of['RECEP','FAT','LAUDO','TOMO']){T.push({t:'ping',de:id,alvo:GW_VLAN[VLAN_EP[id]]},{t:'ping',de:id,alvo:'10.10.1.20'},{t:'ping',de:id,alvo:'8.8.8.8'})}
  for(const id of['RECEP','FAT','LAUDO'])T.push({t:'dns',de:id,nome:'pacs.hvc.local'},{t:'dns',de:id,nome:'google.com'});
  T.push({t:'tcp',de:'TOMO',alvo:'10.10.1.20',porta:104},{t:'tcp',de:'LAUDO',alvo:'10.10.1.20',porta:443},{t:'ping',de:'DNS',alvo:'8.8.8.8'},{t:'ping',de:'PACS',alvo:'10.10.1.10'});
  for(const k of Object.keys(COND))T.push({t:'cond',id:k});return T}
function rodarTeste(st,t){if(t.t==='ping')return ping(st,t.de,t.alvo).tipo==='ok';if(t.t==='dns')return resolver(st,t.de,t.nome).ok;if(t.t==='tcp')return conectar(st,t.de,t.alvo,t.porta).ok;if(t.t==='cond')return(COND[t.id]||COND_EXTRA[t.id])(st);if(t.t==='semping')return ping(st,t.de,t.alvo).tipo!=='ok';if(t.t==='bloqtcp'){const r=conectar(st,t.de,t.alvo,t.porta);return!r.ok&&r.motivo==='acl'}return false}
function descTeste(st,t){const n=t.de&&st.devs[t.de]?st.devs[t.de].nome:'';
  if(t.t==='ping')return`${n} → ping ${t.alvo}`;if(t.t==='dns')return`${n} → resolver ${t.nome}`;if(t.t==='tcp')return`${n} → conexão TCP ${t.alvo}:${t.porta}${t.porta===104?' (DICOM)':t.porta===443?' (HTTPS)':''}`;if(t.t==='semping')return`${n} → NÃO pode alcançar ${t.alvo} (regra de segurança da mudança)`;if(t.t==='bloqtcp')return`${n} → TCP ${t.alvo}:${t.porta} tem que ser BLOQUEADO pela ACL (exigência da auditoria)`;return COND_DESC[t.id]}
function validar(st,ch){const lista=[...ch.defeitos.flatMap(x=>x.testes),...matriz()];const falhas=[],vistos=new Set();
  for(const t of lista){const k=JSON.stringify(t);if(vistos.has(k))continue;vistos.add(k);if(!rodarTeste(st,t))falhas.push(descTeste(st,t))}return falhas}

/* ================= defeitos ================= */
function log(st,dev,msg){const d=st.devs[dev];d.logs.push({t:st.relogio,msg});if(d.logs.length>60)d.logs.shift()}
const IOS_FIX=(dev,linhas)=>({dev,linhas:['enable','configure terminal',...linhas,'end','write memory']});
const DOC_EP={RECEP:'Recepção do Pronto-Socorro',FAT:'Faturamento',TOMO:'Tomografia · 3º andar',LAUDO:'Sala de laudos · 3º andar'};
const livres=(ocup,lista)=>{const l=lista.filter(x=>!ocup.has(x));return l.length?l:lista};

const DEFEITOS=[
{id:'gw',nivel:1,area:'Host · gateway',
 aplicar(st,r,oc){const alvo=pick(r,livres(oc,['TOMO','FAT']));oc.add(alvo);const n=st.devs[alvo].nic;
   if(alvo==='TOMO')n.gw='10.10.30.254';else Object.assign(n,{dhcp:false,ip:'10.10.10.55',mask:'255.255.255.0',gw:'10.10.10.254',dns:'10.10.1.10'});
   return{alvo,errado:n.gw,certo:alvo==='TOMO'?'10.10.30.1':'10.10.10.1'}},
 chamado:c=>c.alvo==='TOMO'?{pri:'P2',titulo:'Tomógrafo não envia exames para o PACS',desc:'"Depois da visita técnica do fabricante, as imagens ficam presas na fila de envio. A tela diz falha de associação DICOM." O ping na própria rede do equipamento parece responder.',solicitante:DOC_EP.TOMO,equip:'TOMO-01'}
   :{pri:'P2',titulo:'Faturamento sem sistema e sem internet depois da troca de PC',desc:'"Trocaram meu computador hoje e nada abre." O técnico de campo configurou o IP na mão, copiando de uma planilha antiga.',solicitante:DOC_EP.FAT,equip:'PC-FAT02'},
 testes:c=>[{t:'ping',de:c.alvo,alvo:'10.10.1.20'},{t:'ping',de:c.alvo,alvo:'8.8.8.8'}],
 dicas:c=>[c.alvo==='TOMO'?'Comece pelo próprio equipamento: <code>rede mostrar</code> no TOMO-01. Compare com a documentação da VLAN 30.':'Comece pelo PC: <code>ipconfig /all</code>. Compare com a documentação da VLAN 10.',
   `O gateway configurado é ${c.errado}. Teste <code>ping ${c.errado}</code> e <code>ping ${c.certo}</code>: só um deles existe.`,
   c.alvo==='TOMO'?'No TOMO-01: <code>rede definir gateway 10.10.30.1</code> e depois <code>dicom eco</code>.':'No PC: <code>netsh interface ip set address "Ethernet" dhcp</code> e depois <code>ping 8.8.8.8</code>.'],
 causa:c=>`Gateway padrão errado (${c.errado}) no ${c.alvo==='TOMO'?'TOMO-01':'PC-FAT02'}. Dentro da própria sub-rede tudo funcionava; o que era de fora ia para um endereço que não existe.`,
 correcao:c=>c.alvo==='TOMO'?['TOMO-01: rede definir gateway 10.10.30.1']:['PC-FAT02: netsh interface ip set address "Ethernet" dhcp'],
 cmds:c=>c.alvo==='TOMO'?[{dev:'TOMO',linhas:['rede definir gateway 10.10.30.1']}]:[{dev:'FAT',linhas:['netsh interface ip set address "Ethernet" dhcp']}],
 licao:'Todo "sem rede" começa no host: IP, máscara, gateway e DNS contra a documentação. Se o gateway certo responde ao ping, cabo, porta e VLAN estão bons e o erro é configuração do equipamento.'},

{id:'dns',nivel:1,area:'Host · DNS',
 aplicar(st,r,oc){const alvo=pick(r,livres(oc,['RECEP','FAT','LAUDO']));oc.add(alvo);st.devs[alvo].nic.dnsManual='10.10.1.99';return{alvo}},
 chamado:c=>({pri:'P3',titulo:'"A internet caiu", mas o ramal e o sistema antigo funcionam',desc:'"Nenhum site abre e o PACS dá página não encontrada." Um colega da TI mexeu nas configurações de rede do PC semana passada para "testar um servidor novo".',solicitante:DOC_EP[c.alvo],equip:{RECEP:'PC-RECEP01',FAT:'PC-FAT02',LAUDO:'PC-LAUDO03'}[c.alvo]}),
 testes:c=>[{t:'dns',de:c.alvo,nome:'pacs.hvc.local'},{t:'dns',de:c.alvo,nome:'google.com'}],
 dicas:c=>['Separe "rede" de "nome": compare <code>ping 8.8.8.8</code> com <code>ping google.com</code>.','Se por IP funciona e por nome não, o problema é DNS. Veja quem responde em <code>nslookup pacs.hvc.local</code> e em <code>ipconfig /all</code>.','O DNS está fixo em 10.10.1.99 (servidor desativado). Volte para automático: <code>netsh interface ip set dns "Ethernet" dhcp</code>.'],
 causa:()=>'DNS configurado manualmente para 10.10.1.99, um servidor que não existe mais. A rede funcionava por IP, mas nenhum nome era traduzido.',
 correcao:c=>[`${{RECEP:'PC-RECEP01',FAT:'PC-FAT02',LAUDO:'PC-LAUDO03'}[c.alvo]}: netsh interface ip set dns "Ethernet" dhcp`],
 cmds:c=>[{dev:c.alvo,linhas:['netsh interface ip set dns "Ethernet" dhcp']}],
 licao:'Teste por IP e por nome separadamente. "Internet caiu" muitas vezes é só DNS. O nslookup mostra qual servidor está respondendo (ou não).'},

{id:'shut',nivel:1,area:'Switch · porta',
 aplicar(st,r,oc){const alvo=pick(r,livres(oc,['RECEP','FAT','TOMO','LAUDO']));oc.add(alvo);const[sw,p]=PORTA_EP[alvo];st.devs[sw].ifs[p].shut=true;
   log(st,sw,`%LINK-5-CHANGED: Interface ${nomeLongo(p)}, changed state to administratively down`);log(st,sw,`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${nomeLongo(p)}, changed state to down`);return{alvo,sw,p}},
 chamado:c=>({pri:'P2',titulo:`${st_nome(c.alvo)} sem rede: ícone com X vermelho`,desc:'"O computador diz cabo de rede desconectado, mas o cabo está ligado e a luz da tomada apagou." Ontem à noite o N3 desligou portas "sem uso" no switch do andar.',solicitante:DOC_EP[c.alvo],equip:st_nome(c.alvo)}),
 testes:c=>[{t:'ping',de:c.alvo,alvo:GW_VLAN[VLAN_EP[c.alvo]]}],
 dicas:c=>[`Mídia desconectada = problema de camada 1. Veja o status da porta no switch do andar: <code>show interfaces status</code> no ${c.sw==='SW1A'?'SW-1A':'SW-3A'}.`,`A porta ${c.p} está "disabled": alguém deu shutdown nela.`,`No ${c.sw==='SW1A'?'SW-1A':'SW-3A'}: <code>configure terminal</code>, <code>interface ${c.p}</code>, <code>no shutdown</code>.`],
 causa:c=>`A porta ${c.p} do ${c.sw==='SW1A'?'SW-1A':'SW-3A'} estava em shutdown (desligada por comando). Status "disabled" no show interfaces status.`,
 correcao:c=>[`${c.sw==='SW1A'?'SW-1A':'SW-3A'}: interface ${c.p} → no shutdown → write memory`],
 cmds:c=>[IOS_FIX(c.sw,['interface '+c.p,'no shutdown'])],
 licao:'"Disabled" = desligada por comando; "notconnect" = sem link físico; "err-disabled" = o switch desligou sozinho por proteção. Cada status leva a uma ação diferente.'},

{id:'vlan',nivel:1,area:'Switch · VLAN de acesso',
 aplicar(st,r,oc){const alvo=pick(r,livres(oc,['RECEP','FAT','LAUDO']));oc.add(alvo);const[sw,p]=PORTA_EP[alvo];st.devs[sw].ifs[p].vlan=99;return{alvo,sw,p,v:VLAN_EP[alvo]}},
 chamado:c=>({pri:'P2',titulo:`${st_nome(c.alvo)} só pega IP 169.254 depois da mudança de layout`,desc:'"A equipe de infraestrutura trocou os pontos de rede de lugar ontem. Hoje o PC liga, a rede aparece conectada, mas sem internet e sem sistema."',solicitante:DOC_EP[c.alvo],equip:st_nome(c.alvo)}),
 testes:c=>[{t:'ping',de:c.alvo,alvo:GW_VLAN[c.v]},{t:'dns',de:c.alvo,nome:'pacs.hvc.local'}],
 dicas:c=>['IP 169.254.x.x (APIPA) = o PC pediu IP ao DHCP e ninguém respondeu. O link está bom; desconfie da VLAN.',`No ${c.sw==='SW1A'?'SW-1A':'SW-3A'}: <code>show vlan brief</code> ou <code>show interfaces status</code>. Em que VLAN está a porta ${c.p}?`,`<code>interface ${c.p}</code> e <code>switchport access vlan ${c.v}</code>.`],
 causa:c=>`A porta ${c.p} ficou na VLAN 99 (quarentena) em vez da VLAN ${c.v}. Sem servidor DHCP nessa VLAN, o Windows se deu um IP APIPA (169.254).`,
 correcao:c=>[`${c.sw==='SW1A'?'SW-1A':'SW-3A'}: interface ${c.p} → switchport access vlan ${c.v}`],
 cmds:c=>[IOS_FIX(c.sw,['interface '+c.p,'switchport access vlan '+c.v])],
 licao:'169.254 nunca é "IP do hospital": é o Windows dizendo que o DHCP não respondeu. Link ok + APIPA = quase sempre VLAN errada ou DHCP fora.'},

{id:'bpdu',nivel:2,area:'Switch · BPDU Guard',
 aplicar(st,r,oc){const alvo=pick(r,livres(oc,['RECEP','FAT','LAUDO','TOMO']));oc.add(alvo);const[sw,p]=PORTA_EP[alvo];st.devs[sw].ifs[p].errdis='bpduguard';
   log(st,sw,`%SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ${nomeLongo(p)} with BPDU Guard enabled. Disabling port.`);
   log(st,sw,`%PM-4-ERR_DISABLE: bpduguard error detected on ${p}, putting ${p} in err-disable state`);
   log(st,sw,`%LINK-3-UPDOWN: Interface ${nomeLongo(p)}, changed state to down`);return{alvo,sw,p}},
 chamado:c=>({pri:'P2',titulo:`Sala sem rede depois que ligaram "um aparelhinho de mais tomadas"`,desc:'"A enfermagem ligou um switch de mesa para ter mais pontos. Caiu tudo. O técnico de campo já tirou o aparelho e religou o PC direto na tomada, mas continua sem rede."',solicitante:DOC_EP[c.alvo],equip:st_nome(c.alvo)}),
 testes:c=>[{t:'ping',de:c.alvo,alvo:GW_VLAN[VLAN_EP[c.alvo]]}],
 dicas:c=>[`Veja o log do switch do andar: <code>show logging</code> no ${c.sw==='SW1A'?'SW-1A':'SW-3A'}.`,`A porta ${c.p} está err-disabled pelo BPDU Guard. Ela não volta sozinha: o switch desligou por proteção.`,`Com a causa removida: <code>interface ${c.p}</code>, <code>shutdown</code>, <code>no shutdown</code>.`],
 causa:c=>`O switch de mesa mandou BPDUs na porta ${c.p}. O BPDU Guard viu isso e colocou a porta em err-disabled para evitar loop. Removida a causa, faltou reativar a porta.`,
 correcao:c=>[`${c.sw==='SW1A'?'SW-1A':'SW-3A'}: interface ${c.p} → shutdown → no shutdown`],
 cmds:c=>[IOS_FIX(c.sw,['interface '+c.p,'shutdown','no shutdown'])],
 licao:'err-disabled é proteção, não defeito: primeiro elimine a causa, depois shutdown/no shutdown. Reativar sem tirar a causa derruba a porta de novo.'},

{id:'trunk',nivel:2,area:'Switch · trunk 802.1Q',
 aplicar(st,r,oc){const x=pick(r,[{sw:'SW1A',v:20,eps:['RECEP']},{sw:'SW1A',v:10,eps:['FAT']},{sw:'SW3A',v:30,eps:['TOMO','LAUDO']}]);x.eps.forEach(e=>oc.add(e));
   const d=st.devs[x.sw];const ups=x.sw==='SW1A'?['Po1','Gi1/0/49','Gi1/0/50','Gi1/0/48']:['Gi1/0/49','Gi1/0/50'];
   const nova=[10,20,30,99].filter(v=>v!==x.v);ups.forEach(p=>d.ifs[p].allowed=nova.slice());
   return Object.assign(x,{ups:x.sw==='SW1A'?['Po1','Gi1/0/48']:['Gi1/0/49','Gi1/0/50'],chg:'CHG-'+(1200+Math.floor(r()*80))})},
 chamado:c=>({pri:'P1',titulo:`${c.v===30?'Setor de imagem':c.v===20?'Recepção do PS':'Faturamento'} inteiro sem rede após janela de mudança`,desc:`Ontem à noite o N3 executou a ${c.chg}: "incluir a VLAN 99 (quarentena) nos uplinks do switch do andar". Hoje cedo ninguém do setor tem rede. Os outros setores do mesmo andar estão normais.`,solicitante:c.v===30?DOC_EP.TOMO:DOC_EP[c.eps[0]],equip:c.sw==='SW1A'?'SW-1A':'SW-3A'}),
 testes:c=>c.eps.map(e=>({t:'ping',de:e,alvo:GW_VLAN[c.v]})),
 dicas:c=>[`Só uma VLAN parou e a mudança foi nos uplinks. No ${c.sw==='SW1A'?'SW-1A':'SW-3A'}: <code>show interfaces trunk</code>.`,`A VLAN ${c.v} sumiu da lista "Vlans allowed on trunk". Quem digitou usou a lista inteira em vez de <code>add</code>.`,`Em cada uplink (${c.ups.join(' e ')}): <code>switchport trunk allowed vlan add ${c.v}</code>.`],
 causa:c=>`Na mudança foi digitado "switchport trunk allowed vlan 10,20,30,99" sem a VLAN ${c.v} (faltou o "add"). A lista foi substituída e a VLAN ${c.v} deixou de passar nos uplinks.`,
 correcao:c=>c.ups.map(p=>`${c.sw==='SW1A'?'SW-1A':'SW-3A'}: interface ${p} → switchport trunk allowed vlan add ${c.v}`),
 cmds:c=>[IOS_FIX(c.sw,c.ups.flatMap(p=>['interface '+(p==='Po1'?'port-channel 1':p),'switchport trunk allowed vlan add '+c.v]))],
 licao:'"switchport trunk allowed vlan X" SUBSTITUI a lista. Para incluir use "add". É um dos erros de mudança mais comuns em produção, por isso toda janela precisa de rollback.'},

{id:'vlandb',nivel:2,area:'Switch · banco de VLANs',
 aplicar(st,r,oc){const x=pick(r,[{sw:'SW1A',v:20,eps:['RECEP']},{sw:'SW1A',v:10,eps:['FAT']},{sw:'SW3A',v:30,eps:['TOMO','LAUDO']}]);x.eps.forEach(e=>oc.add(e));delete st.devs[x.sw].vlans[x.v];return x},
 chamado:c=>({pri:'P1',titulo:`${c.v===30?'Imagem':c.v===20?'Recepção':'Faturamento'} sem rede depois da "limpeza de VLANs antigas"`,desc:`O N3 apagou VLANs que "não estavam em uso" no ${c.sw==='SW1A'?'SW-1A':'SW-3A'}. Desde então os equipamentos do setor ficaram sem rede. O link físico parece normal.`,solicitante:c.v===30?DOC_EP.TOMO:DOC_EP[c.eps[0]],equip:c.sw==='SW1A'?'SW-1A':'SW-3A'}),
 testes:c=>c.eps.map(e=>({t:'ping',de:e,alvo:GW_VLAN[c.v]})),
 dicas:c=>[`Veja o status das portas do setor: <code>show interfaces status</code>. Repare na palavra "inactive".`,`"inactive" = a porta aponta para uma VLAN que não existe no switch. Confira com <code>show vlan brief</code>.`,`Recrie a VLAN: <code>vlan ${c.v}</code> e <code>name ${NOME_VLAN[c.v]}</code>.`],
 causa:c=>`A VLAN ${c.v} foi apagada do ${c.sw==='SW1A'?'SW-1A':'SW-3A'}. As portas de acesso continuaram configuradas nela, mas ficaram "inactive", e o trunk parou de transportar a VLAN.`,
 correcao:c=>[`${c.sw==='SW1A'?'SW-1A':'SW-3A'}: vlan ${c.v} → name ${NOME_VLAN[c.v]}`],
 cmds:c=>[IOS_FIX(c.sw,['vlan '+c.v,'name '+NOME_VLAN[c.v]])],
 licao:'Antes de apagar uma VLAN, rode show vlan brief e show interfaces trunk em todos os switches. "Sem portas" na lista não quer dizer "sem uso": ela pode estar só no trunk.'},

{id:'svi',nivel:2,area:'Core · interface VLAN (gateway)',
 aplicar(st,r,oc){const v=pick(r,[10,20,30]);const eps=Object.keys(VLAN_EP).filter(e=>VLAN_EP[e]===v);eps.forEach(e=>oc.add(e));st.devs.CORE.svis[v].shut=true;
   log(st,'CORE',`%LINK-5-CHANGED: Interface Vlan${v}, changed state to administratively down`);log(st,'CORE',`%LINEPROTO-5-UPDOWN: Line protocol on Interface Vlan${v}, changed state to down`);return{v,eps}},
 chamado:c=>({pri:'P1',titulo:`${c.v===30?'Setor de imagem':c.v===20?'Recepção do PS':'Faturamento'} sem rede: ninguém pega IP`,desc:'Todos os PCs do setor ficaram com IP 169.254 e os equipamentos com IP fixo não alcançam nada. Os switches do andar estão ligados e o link das portas acende normal.',solicitante:c.v===30?DOC_EP.TOMO:DOC_EP[c.eps[0]],equip:'CORE-01'}),
 testes:c=>c.eps.map(e=>({t:'ping',de:e,alvo:GW_VLAN[c.v]})),
 dicas:c=>[`O setor inteiro caiu, mas os switches de acesso estão ok. Quem é o gateway e o DHCP da VLAN ${c.v}? Olhe o CORE-01.`,`No CORE-01: <code>show ip interface brief</code>. Procure a Vlan${c.v}.`,`<code>interface vlan ${c.v}</code> e <code>no shutdown</code>.`],
 causa:c=>`A interface Vlan${c.v} do CORE-01 (gateway e servidor DHCP da VLAN) estava em shutdown. Sem gateway, ninguém saía da VLAN e o DHCP não respondia.`,
 correcao:c=>[`CORE-01: interface vlan ${c.v} → no shutdown`],
 cmds:c=>[IOS_FIX('CORE',['interface vlan '+c.v,'no shutdown'])],
 licao:'Quando um setor INTEIRO cai, suba um nível: o problema costuma estar no que todos compartilham (gateway, DHCP, uplink), não nos PCs.'},

{id:'rota',nivel:2,area:'Core · rota padrão',grupo:'internet',
 aplicar(st){st.devs.CORE.rotas=st.devs.CORE.rotas.filter(r=>r.rede!=='0.0.0.0');return{}},
 chamado:()=>({pri:'P1',titulo:'Hospital inteiro sem internet; sistemas internos funcionando',desc:'"O PACS e o prontuário abrem, mas nenhum site externo." O N3 fez uma "limpeza de rotas estáticas antigas" no core ontem à noite.',solicitante:'Central de atendimento',equip:'CORE-01'}),
 testes:()=>[{t:'ping',de:'RECEP',alvo:'8.8.8.8'},{t:'ping',de:'LAUDO',alvo:'8.8.8.8'}],
 dicas:()=>['Interno ok e externo não: siga o caminho com <code>tracert 8.8.8.8</code> em um PC. Onde ele para?','O primeiro salto (o core) responde "rede de destino inacessível". Veja <code>show ip route</code> no CORE-01.','Falta a rota padrão: <code>ip route 0.0.0.0 0.0.0.0 10.10.0.1</code>.'],
 causa:()=>'A rota padrão do CORE-01 (0.0.0.0/0 via 10.10.0.1, o FortiGate) foi apagada. O core conhecia as redes internas, mas não sabia para onde mandar o resto.',
 correcao:()=>['CORE-01: ip route 0.0.0.0 0.0.0.0 10.10.0.1'],
 cmds:()=>[IOS_FIX('CORE',['ip route 0.0.0.0 0.0.0.0 10.10.0.1'])],
 licao:'"Gateway of last resort is not set" no show ip route = sem rota padrão. O tracert mostra exatamente qual salto deixou de saber o caminho.'},

{id:'duplex',nivel:2,area:'Camada 1 · duplex',
 aplicar(st,r,oc){const p=st.devs.CORE.ifs['Gi1/0/4'];p.speed='1000';p.duplex='full';
   log(st,'CORE','%CDP-4-DUPLEX_MISMATCH: duplex mismatch discovered on GigabitEthernet1/0/4 (not half duplex), with SW-3A GigabitEthernet1/0/49 (half duplex).');return{}},
 chamado:()=>({pri:'P3',titulo:'3º andar lento: imagens demoram e às vezes dão erro',desc:'"Não caiu, mas está muito lento. O laudo demora minutos para abrir e às vezes o envio do tomógrafo falha e reenvia." Começou depois de uma "padronização de portas" no core.',solicitante:DOC_EP.LAUDO,equip:'CORE-01 / SW-3A'}),
 testes:()=>[{t:'cond',id:'perda'}],
 dicas:()=>['Lentidão com perda intermitente: faça <code>ping 10.10.1.20</code> no PC-LAUDO03 e veja se perde pacotes. Depois olhe os contadores de erro.','No SW-3A: <code>show interfaces gi1/0/49</code> (late collisions). No CORE-01: <code>show interfaces gi1/0/4</code> (CRC) e <code>show logging</code>.','Um lado foi travado em 1000/full e o outro ficou em automático (caiu para half). No CORE-01: <code>interface gi1/0/4</code>, <code>speed auto</code>, <code>duplex auto</code>.'],
 causa:()=>'Duplex mismatch: o CORE-01 Gi1/0/4 foi fixado em 1000/full e o SW-3A ficou em automático. Sem negociação do outro lado, o automático cai para half duplex. Resultado: colisões tardias de um lado, CRC do outro e perda de pacotes.',
 correcao:()=>['CORE-01: interface gi1/0/4 → speed auto → duplex auto'],
 cmds:()=>[IOS_FIX('CORE',['interface gi1/0/4','speed auto','duplex auto'])],
 licao:'Velocidade e duplex: ou automático dos dois lados, ou fixo dos dois lados. Nunca misture. Lentidão + CRC/late collision = olhe duplex antes de culpar o sistema.'},

{id:'lacp',nivel:3,area:'Switch · LACP / EtherChannel',
 aplicar(st){const A=st.devs.SW1A;['Gi1/0/49','Gi1/0/50'].forEach(p=>A.ifs[p].cg={n:1,mode:'on'});
   ['Gi1/0/2','Gi1/0/3'].forEach(p=>log(st,'CORE',`%EC-5-L3DONTBNDL2: ${p} suspended: LACP currently not enabled on the remote port.`));log(st,'CORE','%LINK-3-UPDOWN: Interface Port-channel1, changed state to down');return{}},
 chamado:()=>({pri:'P3',titulo:'Alerta do Zabbix: Port-channel1 do CORE-01 caiu',desc:'Alerta automático: "Po1 CORE-01 DOWN, 2 de 2 membros suspensos". Nenhum usuário reclamou ainda, porque o 1º andar está passando pelo link de backup do 3º andar. Ontem o SW-1A foi reconfigurado por um terceiro.',solicitante:'NOC / monitoramento',equip:'CORE-01 / SW-1A'}),
 testes:()=>[{t:'cond',id:'po1'}],
 dicas:()=>['Compare os dois lados: <code>show etherchannel summary</code> no CORE-01 e no SW-1A. Repare na coluna Protocol e nas letras entre parênteses.','O CORE-01 usa LACP (mode active). No SW-1A a coluna Protocol aparece "-": foi configurado "mode on" (sem negociação). Os dois lados precisam do mesmo protocolo.','No SW-1A: <code>interface range gi1/0/49 - 50</code> e <code>channel-group 1 mode active</code>.'],
 causa:()=>'No SW-1A os membros do Po1 foram configurados com "channel-group 1 mode on" (EtherChannel estático), enquanto o CORE-01 usa LACP ativo. Um lado manda LACP e o outro não responde, então o core suspende os links.',
 correcao:()=>['SW-1A: interface range gi1/0/49 - 50 → channel-group 1 mode active'],
 cmds:()=>[IOS_FIX('SW1A',['interface range gi1/0/49 - 50','channel-group 1 mode active'])],
 licao:'LACP precisa casar: active/active ou active/passive. "on" só com "on". Na etherchannel summary, (P) = agregado, (s) = suspenso, (I) = sozinho.'},

{id:'loop',nivel:3,area:'Switch · STP / loop',
 aplicar(st){const B=st.devs.SW3A;['Gi1/0/7','Gi1/0/8'].forEach((p,i)=>Object.assign(B.ifs[p],{desc:'SALA 305 PONTO '+(i?'B':'A'),vlan:30,portfast:true,bpdufilter:true}));
   st.links.push({a:['SW3A','Gi1/0/7'],b:['SW3A','Gi1/0/8'],patch:true});
   log(st,'SW3A','%SW_MATM-4-MACFLAP_NOTIF: Host 0050.56aa.3003 in vlan 30 is flapping between port Gi1/0/7 and port Gi1/0/8');
   log(st,'SW3A','%SW_MATM-4-MACFLAP_NOTIF: Host 00a1.c0de.001e in vlan 30 is flapping between port Gi1/0/49 and port Gi1/0/8');return{}},
 chamado:()=>({pri:'P1',titulo:'Imagem parou inteira e o switch do 3º andar pisca sem parar',desc:'"Os LEDs do switch estão piscando todos juntos, muito rápido." A equipe de limpeza da sala 305 desconectou e reconectou cabos hoje cedo. A sala tem um ponto de rede duplo na parede.',solicitante:DOC_EP.TOMO,equip:'SW-3A'}),
 testes:()=>[{t:'cond',id:'storm'},{t:'ping',de:'LAUDO',alvo:'10.10.1.20'}],
 dicas:()=>['LEDs piscando juntos + setor inteiro parado = suspeita de loop. Veja <code>show logging</code> no SW-3A (MAC flapping).','O MAC "pula" entre Gi1/0/7 e Gi1/0/8: um cabo liga os dois pontos da sala 305. O STP não bloqueou porque essas portas têm BPDU filter (veja <code>show running-config interface gi1/0/7</code>).','Quebre o loop: <code>interface gi1/0/8</code> e <code>shutdown</code>. Depois, o certo é tirar o bpdufilter e usar bpduguard nessas portas.'],
 causa:()=>'Um cabo ligou o ponto A ao ponto B da sala 305 (Gi1/0/7 ↔ Gi1/0/8 do SW-3A). As portas tinham "spanning-tree bpdufilter enable", que faz o STP ignorar a porta. Sem STP, o broadcast ficou girando em círculo: tempestade na VLAN 30 inteira.',
 correcao:()=>['SW-3A: interface gi1/0/8 → shutdown (ou no spanning-tree bpdufilter + spanning-tree bpduguard enable)'],
 cmds:()=>[IOS_FIX('SW3A',['interface gi1/0/8','shutdown'])],
 licao:'BPDU filter em porta de usuário desliga a proteção contra loop. Em porta de acesso use portfast + bpduguard: se aparecer outro switch ou um cabo em loop, a porta cai sozinha (err-disabled) e o resto da rede continua no ar.'},

{id:'acl',nivel:3,area:'Core · ACL (curinga)',
 aplicar(st){const C=st.devs.CORE;const h=ip=>({ip,wc:'0.0.0.0'}),any={any:true};
   C.acls['PACS-IMAGEM']={regras:[
     {seq:10,acao:'permit',proto:'icmp',src:any,dst:any},
     {seq:20,acao:'permit',proto:'tcp',src:{ip:'10.10.30.0',wc:'0.0.0.0'},dst:h('10.10.1.20'),porta:104},
     {seq:25,acao:'permit',proto:'tcp',src:{ip:'10.10.30.0',wc:'0.0.0.255'},dst:h('10.10.1.20'),porta:443},
     {seq:30,acao:'permit',proto:'udp',src:{ip:'10.10.30.0',wc:'0.0.0.255'},dst:h('10.10.1.10'),porta:53},
     {seq:40,acao:'deny',proto:'ip',src:{ip:'10.10.30.0',wc:'0.0.0.255'},dst:{ip:'10.10.0.0',wc:'0.0.255.255'}},
     {seq:50,acao:'permit',proto:'ip',src:any,dst:any}]};
   C.svis[30].aclIn='PACS-IMAGEM';return{}},
 chamado:()=>({pri:'P2',titulo:'Tomógrafo não envia ao PACS, mas o ping no servidor responde',desc:'"O laudo abre as imagens antigas normal. O tomógrafo dá falha de associação DICOM ao enviar." Ontem entrou a CHG de segurança "ACL da VLAN de imagem: liberar só o necessário".',solicitante:DOC_EP.TOMO,equip:'TOMO-01 / CORE-01'}),
 testes:()=>[{t:'tcp',de:'TOMO',alvo:'10.10.1.20',porta:104}],
 dicas:()=>['Ping funcionar não prova que o serviço funciona: ICMP e DICOM (TCP 104) são tratados diferente. No TOMO-01: <code>dicom eco</code>.','No CORE-01: <code>show access-lists</code> e <code>show running-config interface vlan 30</code>. Leia a linha do TCP 104 com calma.','A curinga 0.0.0.0 casa só o endereço 10.10.30.0, não a rede toda. Corrija: <code>ip access-list extended PACS-IMAGEM</code>, <code>no 20</code>, <code>20 permit tcp 10.10.30.0 0.0.0.255 host 10.10.1.20 eq 104</code>.'],
 causa:()=>'Na ACL PACS-IMAGEM, a linha 20 liberava o DICOM com curinga 0.0.0.0 ("10.10.30.0 0.0.0.0" = só o IP 10.10.30.0). O tomógrafo (10.10.30.50) não casava, caía na linha 40 (deny para a rede interna) e o DICOM era bloqueado. O ping passava pela linha 10.',
 correcao:()=>['CORE-01: ip access-list extended PACS-IMAGEM → no 20 → 20 permit tcp 10.10.30.0 0.0.0.255 host 10.10.1.20 eq 104'],
 cmds:()=>[IOS_FIX('CORE',['ip access-list extended PACS-IMAGEM','no 20','20 permit tcp 10.10.30.0 0.0.0.255 host 10.10.1.20 eq 104'])],
 licao:'Curinga é o inverso da máscara: 0 = "tem que ser igual", 255 = "tanto faz". /24 vira 0.0.0.255. E teste a porta do serviço, não só o ping.'},

{id:'fwpol',nivel:3,area:'FortiGate · política',grupo:'internet',
 aplicar(st){st.devs.FGT.politicas[0].status=false;return{}},
 chamado:()=>({pri:'P1',titulo:'Ninguém navega na internet; rede interna normal',desc:'"Desde a manutenção do firewall às 6h, nenhum site abre." O PACS e o prontuário funcionam. O CORE-01 está normal segundo o N3.',solicitante:'Central de atendimento',equip:'FGT-HVC'}),
 testes:()=>[{t:'ping',de:'RECEP',alvo:'8.8.8.8'},{t:'ping',de:'FAT',alvo:'8.8.8.8'}],
 dicas:()=>['Faça <code>tracert 8.8.8.8</code> em um PC: até onde o pacote chega? O último salto que responde é o FortiGate (10.10.0.1).','No FGT-HVC: <code>diagnose debug flow trace start 10</code> logo depois de um ping a partir de um PC. A mensagem diz qual política barrou.','"policy 0" = nenhuma política ativa casou (negação implícita). Veja <code>show firewall policy</code>: a política 1 está com "set status disable". Corrija com <code>config firewall policy</code>, <code>edit 1</code>, <code>set status enable</code>, <code>end</code>.'],
 causa:()=>'A política 1 (LAN-para-Internet) do FortiGate ficou desabilitada depois da manutenção. Sem política que case, o FortiGate aplica a negação implícita (policy 0) e descarta.',
 correcao:()=>['FGT-HVC: config firewall policy → edit 1 → set status enable → end'],
 cmds:()=>[{dev:'FGT',linhas:['config firewall policy','edit 1','set status enable','next','end']}],
 licao:'No FortiGate, o "diagnose debug flow" diz exatamente o que aconteceu com o pacote: rota, política e NAT. É a ferramenta número 1 de troubleshooting de firewall.'},

{id:'fwnat',nivel:3,area:'FortiGate · NAT',grupo:'internet',
 aplicar(st){st.devs.FGT.politicas[0].nat=false;return{}},
 chamado:()=>({pri:'P1',titulo:'Internet fora para o hospital todo depois da "revisão de NAT"',desc:'"Nenhum site abre." O N3 revisou as políticas do firewall ontem para "tirar NAT desnecessário". O tracert passa do firewall, mas não volta nada.',solicitante:'Central de atendimento',equip:'FGT-HVC'}),
 testes:()=>[{t:'ping',de:'RECEP',alvo:'8.8.8.8'},{t:'ping',de:'LAUDO',alvo:'8.8.8.8'}],
 dicas:()=>['Capture no firewall durante um ping de um PC: <code>diagnose sniffer packet any \'icmp\' 4</code>. Com que IP de origem o pacote sai na port1 (WAN)?','O pacote sai para a internet com IP 10.10.x.x. IP privado não é roteado na internet: a resposta nunca volta.','Veja <code>show firewall policy</code> (a linha "set nat enable" sumiu). Corrija: <code>config firewall policy</code>, <code>edit 1</code>, <code>set nat enable</code>, <code>end</code>.'],
 causa:()=>'O NAT da política 1 foi desligado. Os pacotes saíam para a internet com IP privado (10.10.x.x), que a operadora descarta. O FortiGate precisa trocar a origem pelo IP público da port1.',
 correcao:()=>['FGT-HVC: config firewall policy → edit 1 → set nat enable → end'],
 cmds:()=>[{dev:'FGT',linhas:['config firewall policy','edit 1','set nat enable','next','end']}],
 licao:'No sniffer, compare o IP de origem na entrada (port2) e na saída (port1). Se não mudou para o IP público, não tem NAT.'},

{id:'fwrota',nivel:3,area:'FortiGate · rota de retorno',grupo:'internet',
 aplicar(st){st.devs.FGT.rotas=st.devs.FGT.rotas.filter(r=>r.id!==2);return{}},
 chamado:()=>({pri:'P1',titulo:'Usuários sem internet, mas o core navega',desc:'"Nenhum PC abre site." Curioso: do próprio CORE-01, o ping 8.8.8.8 funciona. Ontem foi feita uma "faxina de rotas estáticas duplicadas" no FortiGate.',solicitante:'Central de atendimento',equip:'FGT-HVC'}),
 testes:()=>[{t:'ping',de:'RECEP',alvo:'8.8.8.8'},{t:'ping',de:'FAT',alvo:'8.8.8.8'}],
 dicas:()=>['O core (10.10.0.2) navega e os PCs (10.10.x.x) não. O que o FortiGate sabe sobre a rede 10.10.20.0? Veja <code>get router info routing-table all</code>.','Rode um ping de um PC e depois <code>diagnose debug flow trace start 10</code> no FGT-HVC: "reverse path check fail". O firewall não tem rota de volta para a rede de origem.','Recrie a rota interna: <code>config router static</code>, <code>edit 2</code>, <code>set dst 10.10.0.0 255.255.0.0</code>, <code>set gateway 10.10.0.2</code>, <code>set device port2</code>, <code>end</code>.'],
 causa:()=>'A rota 10.10.0.0/16 via 10.10.0.2 (port2) foi apagada do FortiGate. Ele só conhecia 10.10.0.0/30 (o link com o core). Pacotes vindos das VLANs falhavam na checagem de caminho reverso (RPF), porque a volta para essas redes iria pela WAN.',
 correcao:()=>['FGT-HVC: config router static → edit 2 → set dst 10.10.0.0 255.255.0.0 → set gateway 10.10.0.2 → set device port2 → end'],
 cmds:()=>[{dev:'FGT',linhas:['config router static','edit 2','set dst 10.10.0.0 255.255.0.0','set gateway 10.10.0.2','set device port2','next','end']}],
 licao:'Roteamento é ida E volta. Se de um ponto funciona e de outro não, compare as origens: o equipamento do meio pode não ter rota de retorno para uma delas.'},
/* ---------- Fase 2 · parte 3: novos casos (Júnior, Pleno, Sênior) ---------- */
{id:'ipdup',nivel:1,area:'Host · IP duplicado',
 aplicar(st,r,oc){oc.add('LAUDO');oc.add('TOMO');Object.assign(st.devs.LAUDO.nic,{dhcp:false,ip:'10.10.30.50',mask:'255.255.255.0',gw:'10.10.30.1',dns:'10.10.1.10'});st.devs.LAUDO.lease=null;return{}},
 chamado:()=>({pri:'P2',titulo:'Tomógrafo "cai e volta" e não envia exames desde hoje cedo',desc:'"O tomógrafo diz que a rede está ok, mas o envio ao PACS falha." Ao mesmo tempo, o técnico de campo instalou um PC-LAUDO03 novo na sala ao lado e "copiou a configuração de rede que estava colada no equipamento".',solicitante:DOC_EP.TOMO,equip:'TOMO-01 / PC-LAUDO03'}),
 testes:()=>[{t:'tcp',de:'TOMO',alvo:'10.10.1.20',porta:104},{t:'ping',de:'TOMO',alvo:'10.10.30.1'}],
 dicas:()=>['Compare a configuração dos dois equipamentos da sala: <code>rede mostrar</code> no TOMO-01 e <code>ipconfig /all</code> no PC-LAUDO03.','Os dois estão com o IP 10.10.30.50. Repare no "(Duplicado)" no ipconfig. As respostas destinadas ao tomógrafo estão indo para o PC.','O PC tem que pegar IP automático: no PC-LAUDO03, <code>netsh interface ip set address "Ethernet" dhcp</code>. Depois teste <code>dicom eco</code> no TOMO-01.'],
 causa:()=>'O PC-LAUDO03 foi configurado à mão com 10.10.30.50, o IP fixo do tomógrafo. Com o IP duplicado, a rede entrega as respostas para quem responder primeiro ao ARP: neste caso o PC, e o tomógrafo fica sem retorno.',
 correcao:()=>['PC-LAUDO03: netsh interface ip set address "Ethernet" dhcp'],
 cmds:()=>[{dev:'LAUDO',linhas:['netsh interface ip set address "Ethernet" dhcp']}],
 licao:'IP fixo só em equipamento documentado (servidores, equipamentos médicos). Sintoma de IP duplicado: "funciona às vezes", o Windows avisa "(Duplicado)" e a captura mostra o mesmo IP respondendo com outro MAC.'},

{id:'svc',nivel:1,area:'Servidor · serviço parado',
 aplicar(st){const P=st.devs.PACS;P.servicos.tcp=P.servicos.tcp.filter(p=>p!==443);P.parados=['PACS-Web'];return{}},
 chamado:()=>({pri:'P2',titulo:'Laudo web não abre: "não é possível acessar esse site"',desc:'"Desde a atualização do servidor de imagens ontem à noite, o sistema de laudos no navegador não abre em nenhum PC." O tomógrafo continua enviando exames normalmente.',solicitante:DOC_EP.LAUDO,equip:'SRV-PACS'}),
 testes:()=>[{t:'tcp',de:'LAUDO',alvo:'10.10.1.20',porta:443}],
 dicas:()=>['A rede chega no servidor? Do PC-LAUDO03: <code>ping 10.10.1.20</code>. E o serviço web (porta 443)? <code>tnc 10.10.1.20 -port 443</code>.','Ping ok e porta fechada: o problema está no servidor, não na rede. Abra o SRV-PACS e veja <code>netstat -an</code> e <code>sc query</code>.','O serviço PACS-Web está parado. No SRV-PACS: <code>net start PACS-Web</code>.'],
 causa:()=>'O serviço PACS-Web (HTTPS, porta 443) não subiu depois da atualização do servidor. A rede estava perfeita: o ping respondia e o DICOM (porta 104) funcionava; só a porta 443 não tinha ninguém escutando, e o servidor respondia RST.',
 correcao:()=>['SRV-PACS: net start PACS-Web'],
 cmds:()=>[{dev:'PACS',linhas:['net start PACS-Web']}],
 licao:'Ping prova a rede, não o serviço. Teste a porta (tnc / Test-NetConnection) e, no servidor, veja quem está escutando (netstat -an). Assim você não perde tempo culpando a rede.'},

{id:'dhcpdns',nivel:2,area:'Core · escopo DHCP',
 aplicar(st,r,oc){const v=pick(r,[10,20]);const eps=Object.keys(VLAN_EP).filter(e=>VLAN_EP[e]===v);eps.forEach(e=>oc.add(e));st.devs.CORE.dhcp[v].dns='10.10.1.99';return{v,eps}},
 chamado:c=>({pri:'P2',titulo:`${c.v===20?'Recepção':'Faturamento'}: "a internet caiu" em todos os PCs do setor`,desc:'"Nenhum site e nenhum sistema por nome abre, em nenhum PC do setor." Ontem o N3 "padronizou os escopos de DHCP do core". Um PC formatado hoje veio com o mesmo problema.',solicitante:c.v===20?DOC_EP.RECEP:DOC_EP.FAT,equip:'CORE-01'}),
 testes:c=>c.eps.map(e=>({t:'dns',de:e,nome:'pacs.hvc.local'})),
 dicas:c=>['Por IP funciona e por nome não? Então é DNS. Veja <code>ipconfig /all</code> no PC: de onde veio o DNS dele?','O DNS veio do DHCP (não foi digitado). Logo, o erro está no escopo de DHCP do CORE-01: <code>show running-config</code> e procure <code>ip dhcp pool VLAN'+c.v+'</code>.',`No CORE-01: <code>ip dhcp pool VLAN${c.v}</code> e <code>dns-server 10.10.1.10</code>. Depois o PC precisa pegar a configuração nova: <code>ipconfig /renew</code>.`],
 causa:c=>`O escopo DHCP da VLAN ${c.v} no CORE-01 estava entregando o DNS 10.10.1.99, que não existe. Todo PC do setor recebia o DNS errado automaticamente. Corrigir o escopo não basta: cada PC só pega o valor novo ao renovar o IP.`,
 correcao:c=>[`CORE-01: ip dhcp pool VLAN${c.v} → dns-server 10.10.1.10`,'PCs do setor: ipconfig /renew'],
 cmds:c=>[IOS_FIX('CORE',[`ip dhcp pool VLAN${c.v}`,'dns-server 10.10.1.10']),...c.eps.map(e=>({dev:e,linhas:['ipconfig /renew']}))],
 licao:'Se o setor inteiro tem o mesmo erro e ninguém mexeu nos PCs, olhe quem entrega a configuração: o DHCP. E lembre: mudança no escopo só chega ao PC quando ele renova o IP.'},

{id:'raiz',nivel:3,area:'STP · raiz errada',
 aplicar(st){st.devs.SW3A.stpPrio=0;log(st,'SW3A','%SPANTREE-5-ROOTCHANGE: Root Changed for vlan 10: New Root Port is -none-. New Root Mac Address is 00a1.c0de.3a00');log(st,'SW1A','%SPANTREE-5-ROOTCHANGE: Root Changed for vlan 20: New Root Port is GigabitEthernet1/0/48. New Root Mac Address is 00a1.c0de.3a00');return{}},
 chamado:()=>({pri:'P3',titulo:'Zabbix: Po1 sem tráfego e link de backup do 1º andar em 90%',desc:'Alerta do NOC: "Port-channel1 (SW-1A ↔ CORE-01) com tráfego zero; link SW-1A Gi1/0/48 ↔ SW-3A saturado". Usuários do 1º andar reclamam de lentidão. Ontem o SW-3A foi trocado por um de reserva e a configuração foi colada de um modelo.',solicitante:'NOC / monitoramento',equip:'SW-1A / SW-3A'}),
 testes:()=>[{t:'cond',id:'raiz'}],
 dicas:()=>['O tráfego mudou de caminho sem nenhum cabo cair. Quem decide o caminho entre switches é o STP. No SW-1A: <code>show spanning-tree vlan 20</code>. Quem é a raiz (Root ID)?','A raiz virou o SW-3A (endereço 00a1.c0de.3a00), não o CORE-01. Veja <code>show running-config</code> no SW-3A: a prioridade dele está em 0, menor que a do core (4096).','No SW-3A: <code>spanning-tree vlan 1-4094 priority 32768</code>. A raiz volta para o CORE-01 e o Po1 volta a encaminhar.'],
 causa:()=>'O SW-3A de reserva veio com "spanning-tree vlan 1-4094 priority 0". Como 0 é menor que 4096, ele virou a raiz do STP. Para chegar até ele, o SW-1A passou a usar o link de backup e bloqueou o Po1 (2 Gb/s) para evitar loop.',
 correcao:()=>['SW-3A: spanning-tree vlan 1-4094 priority 32768'],
 cmds:()=>[IOS_FIX('SW3A',['spanning-tree vlan 1-4094 priority 32768'])],
 licao:'Defina a raiz de propósito (core com prioridade baixa) e confira a prioridade de todo switch novo antes de ligar. Raiz errada não derruba a rede: ela piora em silêncio, e só o monitoramento ou o show spanning-tree mostram.'},

{id:'aclordem',nivel:3,area:'Core · ordem da ACL',
 aplicar(st){const C=st.devs.CORE,any={any:true},r=(ip,wc)=>({ip,wc});
   C.acls['FAT-IN']={regras:[{seq:5,remark:'CHG-1201 isolar faturamento da imagem'},{seq:10,acao:'deny',proto:'ip',src:r('10.10.10.0','0.0.0.255'),dst:any},{seq:20,acao:'deny',proto:'ip',src:r('10.10.10.0','0.0.0.255'),dst:r('10.10.30.0','0.0.0.255')},{seq:30,acao:'permit',proto:'ip',src:any,dst:any}]};
   C.svis[10].aclIn='FAT-IN';return{}},
 chamado:()=>({pri:'P1',titulo:'Faturamento inteiro sem sistema, sem internet e sem nada',desc:'"Desde as 7h nenhum PC do faturamento acessa nada." Ontem à noite foi executada a CHG-1201: "isolar o faturamento da VLAN de imagem (exigência da auditoria)". A exigência continua valendo: o faturamento não pode alcançar a imagem.',solicitante:DOC_EP.FAT,equip:'CORE-01'}),
 testes:()=>[{t:'ping',de:'FAT',alvo:'10.10.1.20'},{t:'semping',de:'FAT',alvo:'10.10.30.63'}],
 dicas:()=>['O PC alcança o próprio gateway (<code>ping 10.10.10.1</code>) e nada além? Olhe o que mudou no CORE-01: <code>show access-lists</code>.','A ACL FAT-IN é lida de cima para baixo e a primeira linha que casa decide. A linha 10 nega TUDO que sai da rede 10.10.10.0 (destino any). As linhas de baixo nunca são usadas.','Remova só a linha errada e mantenha o isolamento: <code>ip access-list extended FAT-IN</code> e <code>no 10</code>. A linha 20 continua bloqueando a imagem.'],
 causa:()=>'A CHG criou a ACL FAT-IN com a linha 10 "deny ip 10.10.10.0 0.0.0.255 any" antes da regra certa. Como a ACL para na primeira linha que casa, todo o tráfego do faturamento era negado, e não só o destinado à imagem.',
 correcao:()=>['CORE-01: ip access-list extended FAT-IN → no 10 (a linha 20 mantém o bloqueio da imagem)'],
 cmds:()=>[IOS_FIX('CORE',['ip access-list extended FAT-IN','no 10'])],
 licao:'Na ACL a ordem é tudo: regra específica em cima, genérica embaixo, e um "permit" no fim, se for o caso. Ao corrigir, prove as duas coisas: o que deve passar passa, e o que deve ser bloqueado continua bloqueado.'},

{id:'aclout',nivel:3,area:'Core · direção da ACL',
 aplicar(st){const C=st.devs.CORE;const h=ip=>({ip,wc:'0.0.0.0'}),any={any:true},n30={ip:'10.10.30.0',wc:'0.0.0.255'};st.devs.FAT.servicos={tcp:[3389]};
   C.acls['PACS-IMAGEM']={regras:[{seq:10,acao:'permit',proto:'icmp',src:any,dst:any},{seq:20,acao:'permit',proto:'tcp',src:n30,dst:h('10.10.1.20'),porta:104},{seq:25,acao:'permit',proto:'tcp',src:n30,dst:h('10.10.1.20'),porta:443},
     {seq:30,acao:'permit',proto:'udp',src:n30,dst:h('10.10.1.10'),porta:53},{seq:40,acao:'deny',proto:'ip',src:n30,dst:{ip:'10.10.0.0',wc:'0.0.255.255'}},{seq:50,acao:'permit',proto:'ip',src:any,dst:any}]};
   C.svis[30].aclOut='PACS-IMAGEM';return{}},
 chamado:()=>({pri:'P2',titulo:'Auditoria: a VLAN de imagem acessa o RDP do faturamento',desc:'Relatório do pentest: "a partir do PC-LAUDO03 foi possível abrir a área de trabalho remota (RDP, TCP 3389) do PC-FAT02". A ACL PACS-IMAGEM, que deveria impedir isso, está aplicada no core desde a CHG-1180. Nada pode parar de funcionar para a imagem.',solicitante:'Segurança da informação',equip:'CORE-01'}),
 testes:()=>[{t:'bloqtcp',de:'LAUDO',alvo:'10.10.10.42',porta:3389}],
 dicas:()=>['Confirme o problema: do PC-LAUDO03, <code>tnc 10.10.10.42 -port 3389</code>. Depois veja a ACL e onde ela está aplicada: <code>show access-lists</code> e <code>show running-config interface vlan 30</code>.','As linhas da ACL usam origem 10.10.30.0 (a imagem). Mas ela está aplicada com "out": só confere o que ENTRA na VLAN 30, cuja origem nunca é 10.10.30.x. Repare nos contadores (matches) zerados nas linhas de deny.',`Inverta a direção: <code>interface vlan 30</code>, <code>no ip access-group PACS-IMAGEM out</code>, <code>ip access-group PACS-IMAGEM in</code>. Teste de novo o RDP e o <code>dicom eco</code>.`],
 causa:()=>'A ACL estava certa, mas aplicada na direção errada. "out" na interface Vlan30 filtra o tráfego que vai PARA a VLAN de imagem; como todas as regras falam de origem 10.10.30.0, nenhuma casava e tudo caía no "permit ip any any" da linha 50.',
 correcao:()=>['CORE-01: interface vlan 30 → no ip access-group PACS-IMAGEM out → ip access-group PACS-IMAGEM in'],
 cmds:()=>[IOS_FIX('CORE',['interface vlan 30','no ip access-group PACS-IMAGEM out','ip access-group PACS-IMAGEM in'])],
 licao:'Na interface VLAN (SVI), "in" = o que sai da VLAN em direção ao roteador; "out" = o que o roteador entrega para dentro da VLAN. Contador de "matches" zerado numa regra que deveria bater é a pista de direção errada.'},

{id:'rogue',nivel:3,area:'DHCP · servidor pirata',
 aplicar(st,r,oc){oc.add('RECEP');instalarPirata(st);return{}},
 chamado:()=>({pri:'P2',titulo:'Recepção do PS com IP 192.168.0.x e sem sistema',desc:'"Alguns PCs da recepção ficaram sem sistema e o ipconfig mostra um IP estranho, 192.168.0.algo." Ninguém da TI mexeu na recepção. A enfermagem comentou que "trouxeram um roteador para ter Wi-Fi na sala de espera".',solicitante:DOC_EP.RECEP,equip:'PC-RECEP01 / SW-1A'}),
 testes:()=>[{t:'ping',de:'RECEP',alvo:'10.10.1.20'},{t:'cond',id:'semPirata'}],
 dicas:()=>['No PC-RECEP01, <code>ipconfig /all</code>: quem é o "Servidor DHCP" que entregou esse IP? O hospital não usa 192.168.0.x.','Algum aparelho na VLAN 20 está distribuindo IP. Ache a porta dele: no SW-1A, <code>show mac address-table</code> e <code>show interfaces status</code>. Que porta tem um MAC que não é de nenhum equipamento conhecido?',`É a Gi1/0/7. No SW-1A: <code>interface gi1/0/7</code> e <code>shutdown</code>. Depois, no PC: <code>ipconfig /renew</code>.`],
 causa:()=>'Um roteador doméstico foi ligado na porta Gi1/0/7 do SW-1A (VLAN 20). Ele tem servidor DHCP próprio e respondeu mais rápido que o CORE-01, entregando 192.168.0.x com gateway 192.168.0.1. Os PCs que renovaram o IP caíram numa rede que não leva a lugar nenhum.',
 correcao:()=>['SW-1A: interface gi1/0/7 → shutdown','PC-RECEP01: ipconfig /renew'],
 cmds:()=>[IOS_FIX('SW1A',['interface gi1/0/7','shutdown']),{dev:'RECEP',linhas:['ipconfig /renew']}],
 licao:'IP de uma faixa que o hospital não usa = DHCP pirata. ipconfig /all mostra quem entregou o IP; show mac address-table mostra em que porta ele está. A prevenção definitiva é o DHCP snooping (nível Sênior).'},

{id:'fwassim',nivel:4,area:'FortiGate · rota mais específica',grupo:'internet',
 aplicar(st){st.devs.FGT.rotas.push({id:3,dst:'10.10.30.0',mask:'255.255.255.0',gw:'200.160.2.1',dev:'port1',status:true});return{}},
 chamado:()=>({pri:'P1',titulo:'Só a imagem (3º andar) está sem internet',desc:'"No 3º andar nenhum site abre; no resto do hospital tudo normal." Curiosamente, o nslookup de sites externos funciona nos PCs da imagem. Ontem a equipe de segurança "testou uma VPN com um fornecedor" no FortiGate e garante que desfez tudo.',solicitante:DOC_EP.LAUDO,equip:'FGT-HVC'}),
 testes:()=>[{t:'ping',de:'LAUDO',alvo:'8.8.8.8'},{t:'ping',de:'TOMO',alvo:'8.8.8.8'}],
 dicas:()=>['Compare: do PC-LAUDO03, <code>ping 8.8.8.8</code> falha e <code>nslookup google.com</code> funciona. A diferença: no nslookup quem sai para a internet é o SRV-DNS (rede 10.10.1.x), não o PC (10.10.30.x).','Rode um ping do PC-LAUDO03 e depois, no FGT-HVC, <code>diagnose debug flow trace start 10</code>: "reverse path check fail". Veja <code>get router info routing-table all</code>: existe uma rota 10.10.30.0/24 apontando para a port1 (WAN).','Rota mais específica (/24) ganha da rota interna (/16). Apague a rota que sobrou do teste: <code>config router static</code>, <code>delete 3</code>, <code>end</code>.'],
 causa:()=>'O teste de VPN deixou a rota estática 3 (10.10.30.0/24 via port1). Como /24 é mais específica que a rota interna 10.10.0.0/16, o FortiGate passou a achar que a imagem fica do lado da internet: os pacotes que chegavam da imagem pela port2 falhavam na checagem de caminho reverso e eram descartados. As outras VLANs não eram afetadas.',
 correcao:()=>['FGT-HVC: config router static → delete 3 → end'],
 cmds:()=>[{dev:'FGT',linhas:['config router static','delete 3','end']}],
 licao:'Roteamento sempre escolhe a rota MAIS ESPECÍFICA (maior máscara), não a mais antiga nem a "principal". Quando só uma sub-rede falha, procure uma rota que case só com ela. E desconfie de "desfiz tudo": confira a tabela.'},

{id:'rogue2',nivel:4,area:'DHCP snooping',
 aplicar(st,r,oc){oc.add('RECEP');instalarPirata(st);log(st,'SW1A','%LINK-3-UPDOWN: Interface GigabitEthernet1/0/7, changed state to up');return{}},
 chamado:()=>({pri:'P1',titulo:'DHCP pirata na recepção pela 3ª vez no mês',desc:'Mesmo problema de novo: PCs da recepção com IP 192.168.0.x. O gerente de TI exige que, desta vez, a rede bloqueie sozinha qualquer aparelho que tente distribuir IP na VLAN 20, mesmo que alguém ligue outro roteador amanhã em qualquer tomada.',solicitante:'Gerência de TI',equip:'SW-1A'}),
 testes:()=>[{t:'ping',de:'RECEP',alvo:'10.10.1.20'},{t:'cond',id:'snoop'}],
 dicas:()=>['Resolver o sintoma é igual ao caso anterior (ache a porta com <code>show mac address-table</code>). Mas a exigência é prevenir: o recurso que bloqueia DHCP de aparelho não autorizado é o <b>DHCP snooping</b>.','DHCP snooping deixa passar ofertas DHCP só pelas portas marcadas como confiáveis (trust). No SW-1A: <code>ip dhcp snooping</code> e <code>ip dhcp snooping vlan 20</code>. Atenção: de onde vêm as ofertas do servidor de verdade?','O DHCP legítimo chega pelo uplink Po1. Sem trust nele, você bloqueia o servidor certo também. <code>interface port-channel 1</code> e <code>ip dhcp snooping trust</code>. Depois <code>ipconfig /renew</code> no PC e <code>show ip dhcp snooping</code>.'],
 causa:()=>'Um roteador doméstico na Gi1/0/7 do SW-1A distribuía IP na VLAN 20. Desligar a porta resolve hoje, mas não impede a próxima vez. Com DHCP snooping ativo na VLAN 20 e só o uplink (Po1) como confiável, o switch descarta qualquer oferta DHCP que chegue por porta de usuário.',
 correcao:()=>['SW-1A: ip dhcp snooping → ip dhcp snooping vlan 20 → interface port-channel 1 → ip dhcp snooping trust','PC-RECEP01: ipconfig /renew'],
 cmds:()=>[IOS_FIX('SW1A',['ip dhcp snooping','ip dhcp snooping vlan 20','interface port-channel 1','ip dhcp snooping trust']),{dev:'RECEP',linhas:['ipconfig /renew']}],
 licao:'Sênior resolve a causa e fecha a porta para o problema voltar. DHCP snooping: ligue na VLAN, marque como trust só o caminho até o servidor DHCP real (uplinks) e nunca as portas de usuário. Esquecer o trust do uplink derruba o DHCP de todo mundo.'}

];
function st_nome(id){return{RECEP:'PC-RECEP01',FAT:'PC-FAT02',LAUDO:'PC-LAUDO03',TOMO:'TOMO-01'}[id]||id}

function novoChamado(n,seed,op){op=op||{};
  for(let k=0;k<20;k++){const s=(seed+k*7919)>>>0;const r=rng(s);const st=criarRede();
    const multi=op.forcar==='multi';const nivel=multi?4:Math.min(op.nivelMax||4,op.nivel||(n<=3?1:n<=6?2:n<=9?3:4));
    let pool=multi?DEFEITOS.filter(f=>f.nivel>=2&&f.nivel<=3&&!['rogue'].includes(f.id)):DEFEITOS.filter(f=>op.forcar?f.id===op.forcar:f.nivel<=nivel);
    if(!op.forcar&&op.evitar){const p2=pool.filter(f=>!op.evitar.includes(f.id));if(p2.length)pool=p2}
    const qtd=multi?3:!op.forcar&&nivel>=3&&n>=8&&r()<(nivel===4?0.5:0.35)?2:1;const defs=[],oc=new Set();
    for(let q=0;q<qtd;q++){const cand=pool.filter(f=>!defs.some(x=>x.f.id===f.id||(f.grupo&&x.f.grupo===f.grupo)));if(!cand.length)break;
      const peso=cand.map(f=>multi||f.nivel===nivel?3:1),tot=peso.reduce((a,b)=>a+b,0);let x=r()*tot,f=cand[0];for(let i=0;i<cand.length;i++){x-=peso[i];if(x<0){f=cand[i];break}}
      defs.push({f,ctx:f.aplicar(st,r,oc)})}
    atualizar(st,{boot:true});
    defs.forEach(x=>{x.testes=x.f.testes(x.ctx);x.ticket=x.f.chamado(x.ctx)});
    if(defs.length<qtd||!defs.every(x=>x.testes.some(t=>!rodarTeste(st,t))))continue;
    const pri=defs.map(x=>x.ticket.pri).sort()[0];
    const num=(defs[0].f.id==='lacp'?'ALR-':defs[0].f.id==='trunk'||defs[0].f.id==='vlandb'?'INC-':'INC-')+(24800+n*13+Math.floor(r()*9));
    return{st,ch:{n,seed:s,nivel,num,pri,defeitos:defs}}}
  throw new Error('não consegui gerar um chamado válido')}

const Motor={ip2n,n2ip,ehIP,mascaraOk,lenDe,maskDe,naRede,redeDe,privado,casaCuringa,listaVlans,vlansTxt,rng,nomeLongo,ordemPorta,normIf,
  ehEp,ehSw,porta,criarRede,atualizar,construirL2,caminhoL2,cfgIP,renovar,liberar,donos,rotas,lpm,ipDe,noDe,ifUp,ipOrigem,
  ping,traceroute,resolver,conectar,viajar,macDe,arpCache,ofertasDhcp,servidorDhcp,matriz,validar,rodarTeste,descTeste,COND,DEFEITOS,novoChamado,log,
  PORTA_EP,VLAN_EP,GW_VLAN,NOME_VLAN,EXTERNOS,custoPorta,pid,stNome:st_nome};
if(typeof module!=='undefined'&&module.exports)module.exports=Motor;else raiz.Motor=Motor;
})(typeof window!=='undefined'?window:globalThis);
