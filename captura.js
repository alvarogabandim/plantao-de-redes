/* Plantão de Redes · captura.js (Fase 2, parte 2)
 * Captura de pacotes estilo Wireshark: pontos de captura, quadros sintéticos (STP, LACP, tempestade),
 * filtros de exibição, detalhes por camada em português, bytes reais e exportação .pcap. */
(function (raiz) {
'use strict';
const M=raiz.Motor||require('./motor.js');
const mac=m=>m.replace(/\./g,'').match(/../g).join(':');
const hx=(n,w)=>n.toString(16).padStart(w,'0');
function incMac(m,n){const v=parseInt(m.replace(/\./g,''),16)+n;const h=hx(v,12);return h.slice(0,4)+'.'+h.slice(4,8)+'.'+h.slice(8)}

/* ---------- pontos de captura ---------- */
function pontos(st){const D=st.devs,out=[];st.links.forEach((L,ix)=>{if(L.patch)return;const[a,ai]=L.a,[b,bi]=L.b,A=D[a],B=D[b];let nome,ord;
  if(M.ehEp(B)){nome=`${B.nome} · cabo do equipamento (${A.nome} ${ai})`;ord=1}
  else if(M.ehEp(A)){nome=`${A.nome} · cabo do equipamento (${B.nome} ${bi})`;ord=1}
  else if(a==='NET'){nome='FGT-HVC port1 ↔ operadora (WAN, internet)';ord=4}
  else if(a==='FGT'){nome='FGT-HVC port2 ↔ CORE-01 Gi1/0/1 (LAN)';ord=3}
  else{nome=`${A.nome} ${ai} ↔ ${B.nome} ${bi}`;ord=2}
  out.push({ix,nome,ord,chave:a+'|'+ai})});return out.sort((x,y)=>x.ord-y.ord||x.nome.localeCompare(y.nome))}
function pontoDe(st,dev){if(dev==='WAN')return st.links.findIndex(L=>L.a[0]==='NET');return st.links.findIndex(L=>(L.a[0]===dev&&L.a[1]==='nic')||(L.b[0]===dev&&L.b[1]==='nic'))}
function pontoNome(st,ix){const p=pontos(st).find(x=>x.ix===ix);return p?p.nome:'?'}
function iniciar(st,ix){st.cap={ativo:true,ix,frames:[],seq:0,tIni:st.relogio||0}}
function parar(st){const c=st.cap;if(!c||!c.ativo)return;c.ativo=false;c.tFim=Math.max(st.relogio||0,c.tIni+1);sinteticos(st,c);c.frames.sort((a,b)=>a.t-b.t);c.frames.forEach((f,i)=>f.n=i+1)}

/* ---------- quadros que os equipamentos mandam sozinhos ---------- */
function sinteticos(st,c){const L=st.l2,D=st.devs,lk=L.link[c.ix],ln=st.links[c.ix];if(!lk||!lk.up)return;
  const add=(t,fr)=>{fr.t=t;c.frames.push(fr)};const nH=Math.max(1,Math.min(8,Math.floor((c.tFim-c.tIni)/2)+1));
  for(const[dv,p]of[ln.a,ln.b]){const d=D[dv];if(!M.ehSw(d))continue;const pc=d.ifs[p];if(!pc||pc.mode==='routed'||pc.bpdufilter||pc.shut||pc.errdis)continue;
    const outro=(ln.a[0]===dv&&ln.a[1]===p)?ln.b:ln.a;let lg=p;if(pc.cg&&lk.lacp&&lk.lacp.compat)lg='Po'+pc.cg.n;
    let vl=[];for(const v of Object.keys(L.stp).map(Number)){const pp=L.stp[v].papel[dv+'|'+lg];if(pp&&pp.r==='Desg')vl.push(v)}
    if(!vl.length&&pc.mode==='access'&&M.ehEp(D[outro[0]])&&L.porta[dv+'|'+p]==='connected')vl.push(pc.vlan);
    for(const v of vl.slice(0,4)){const res=L.stp[v];const R=D[res&&res.raiz[dv]?res.raiz[dv]:dv];const custo=res&&res.rc[dv]!=null?res.rc[dv]:0;
      for(let k=0;k<nH;k++)add(c.tIni+0.31+2*k+v*0.0007+(dv.length%5)*0.0003,{eth:'stp',src:incMac(d.mac,M.pid(lg)),dst:'0180.c200.0000',vlan:pc.mode==='trunk'&&v!==pc.native?v:null,
        stp:{v,root:{prio:R.stpPrio+v,mac:R.mac},custo,br:{prio:d.stpPrio+v,mac:d.mac},port:0x8000+M.pid(lg),de:d.nome}})}}
  if(lk.lacp)for(const[dv,p]of[ln.a,ln.b]){const pc=D[dv].ifs[p];if(!pc||!pc.cg||pc.cg.mode==='on')continue;const outro=(ln.a[0]===dv&&ln.a[1]===p)?ln.b:ln.a;const oc=D[outro[0]].ifs[outro[1]];
    if(pc.cg.mode==='passive'&&!(oc&&oc.cg&&oc.cg.mode==='active'))continue;const est=lk.lacp[ln.a[0]===dv&&ln.a[1]===p?'a':'b'];
    add(c.tIni+0.7+(dv<outro[0]?0:0.002),{eth:'lacp',src:incMac(D[dv].mac,M.pid(p)),dst:'0180.c200.0002',vlan:null,lacp:{sys:D[dv].mac,de:D[dv].nome,key:pc.cg.n,port:M.pid(p),ativo:pc.cg.mode==='active',sync:est==='P',parc:est==='P'?D[outro[0]].mac:'0000.0000.0000',pport:est==='P'?M.pid(outro[1]):0}})}
  const tempestade=ln.patch||[...lk.fwd].some(v=>L.stormVlan.has(v))||[ln.a,ln.b].some(([d])=>M.ehEp(D[d])&&L.stormSeg.has(L.seg.get('E:'+d)));
  if(tempestade){const v=[...L.stormVlan][0]||30;const hs=Object.values(D).filter(d=>M.ehEp(d)&&M.VLAN_EP[d.id]===v);const tag=M.ehSw(D[ln.a[0]])&&M.ehSw(D[ln.b[0]])?v:null;
    for(let i=0;i<300;i++){const h=hs[i%Math.max(1,hs.length)]||D.LAUDO;const ip=M.cfgIP(st,h).ip;add(c.tIni+0.05+i*0.000031,{eth:'arp',src:h.mac,dst:'ffff.ffff.ffff',vlan:tag,storm:true,arp:{op:1,sha:h.mac,spa:ip,tha:'0000.0000.0000',tpa:M.GW_VLAN[v]||'10.10.30.1'}})}}}

/* ---------- lista: protocolo, resumo e cor ---------- */
const DHCPT={1:'Discover',2:'Offer',3:'Request',5:'ACK',6:'NAK',7:'Release'};
const ORDF=['F','S','R','P','A'],NOMEF={F:'FIN',S:'SYN',R:'RST',P:'PSH',A:'ACK'};
const flagsTxt=f=>ORDF.filter(x=>f.includes(x)).map(x=>NOMEF[x]).join(', ');
function proto(f){if(f.eth==='arp')return'ARP';if(f.eth==='stp')return'STP';if(f.eth==='lacp')return'LACP';const l=f.l4||{};if(l.dns)return'DNS';if(l.dhcp)return'DHCP';if(l.icmp)return'ICMP';if(l.tcp)return'TCP';if(l.udp)return'UDP';return'IPv4'}
function relSeq(t){return t.flags==='S'?'Seq=0':t.flags==='SA'?'Seq=0 Ack=1':'Seq=1 Ack=1'}
function info(f){const l=f.l4||{};
  if(f.eth==='arp'){const a=f.arp;return a.op===1?`Who has ${a.tpa}? Tell ${a.spa}`:`${a.spa} is at ${mac(a.sha)}`}
  if(f.eth==='stp'){const s=f.stp;return`RST. Root = ${s.root.prio-s.v}/${s.v}/${mac(s.root.mac)}  Cost = ${s.custo}  Port = 0x${hx(s.port,4)}`}
  if(f.eth==='lacp'){const a=f.lacp;return`v1 ACTOR ${mac(a.sys)} P: ${a.port} K: ${a.key} ${a.sync?'(em sincronia)':'(fora de sincronia)'} PARTNER ${mac(a.parc)} P: ${a.pport}`}
  if(l.icmp){const c=l.icmp;if(c.t===8)return`Echo (ping) request  id=0x0001, seq=${c.seq}/${c.seq*256}, ttl=${f.ip.ttl}`;if(c.t===0)return`Echo (ping) reply    id=0x0001, seq=${c.seq}/${c.seq*256}, ttl=${f.ip.ttl}`;
    if(c.t===3)return'Destination unreachable (Network unreachable)';if(c.t===11)return'Time-to-live exceeded (Time to live exceeded in transit)';return'ICMP'}
  if(l.dns){const d=l.dns,id='0x'+hx(d.id,4);if(!d.resp)return`Standard query ${id} A ${d.q}`;if(d.rcode===3)return`Standard query response ${id} No such name A ${d.q}`;if(d.rcode===2)return`Standard query response ${id} Server failure A ${d.q}`;return`Standard query response ${id} A ${d.q} A ${d.a}`}
  if(l.dhcp)return`DHCP ${DHCPT[l.dhcp.t]} - Transaction ID 0x${hx(l.dhcp.xid>>>0,8)}`;
  if(l.tcp){const t=l.tcp;return`${t.retr?'[TCP Retransmission] ':''}${t.sp} → ${t.dp} [${flagsTxt(t.flags)}] ${relSeq(t)} Win=${t.flags==='SA'?65160:64240} Len=0`}
  if(l.udp)return`${l.udp.sp} → ${l.udp.dp} Len=0`;return''}
function cor(f){const l=f.l4||{};if(f.storm)return'c-ruim';if(l.tcp&&(l.tcp.flags.includes('R')||l.tcp.retr))return'c-ruim';if(l.icmp&&(l.icmp.t===3||l.icmp.t===11))return'c-icmperr';
  if(f.eth==='arp')return'c-arp';if(f.eth==='stp'||f.eth==='lacp')return'c-stp';if(l.icmp)return'c-icmp';if(l.tcp)return l.tcp.flags.includes('S')?'c-tcpsyn':'c-tcp';if(l.udp)return'c-udp';return''}
function orig(f){return f.eth==='ip'?f.ip.src:f.eth==='arp'?mac(f.src):mac(f.src)}
function dest(f){if(f.dst==='ffff.ffff.ffff'&&f.eth!=='ip')return'Broadcast';if(f.eth==='stp')return'Spanning-tree';if(f.eth==='lacp')return'Slow-Protocols';return f.eth==='ip'?f.ip.dst:mac(f.dst)}
function traducao(f){const l=f.l4||{};
  if(f.storm)return'Tempestade: o mesmo broadcast girando sem parar por causa de um loop. Centenas de cópias em milissegundos.';
  if(f.eth==='arp')return f.arp.op===1?`"Quem tem o IP ${f.arp.tpa}? Responda para ${f.arp.spa}." Vai para todos (broadcast).`:`"O IP ${f.arp.spa} sou eu, meu MAC é ${mac(f.arp.sha)}."`;
  if(f.eth==='stp')return`O ${f.stp.de} avisa a rede: "a raiz do STP da VLAN ${f.stp.v} é ${mac(f.stp.root.mac)} e eu estou a custo ${f.stp.custo} dela". Repete a cada 2 segundos.`;
  if(f.eth==='lacp')return`O ${f.lacp.de} negocia o EtherChannel (LACP) nesta porta. ${f.lacp.sync?'O outro lado respondeu: agregado.':'O outro lado não respondeu com LACP.'}`;
  if(l.icmp){const t=l.icmp.t;return t===8?'Pedido de ping ("você está aí?").':t===0?'Resposta do ping ("estou aqui").':t===3?'Um roteador avisa: "não tenho caminho para essa rede".':'Um roteador avisa: "o TTL acabou aqui". É assim que o tracert descobre cada salto.'}
  if(l.dns){const d=l.dns;return!d.resp?`Pergunta ao DNS: "qual é o IP de ${d.q}?"`:d.rcode===3?`Resposta: "o nome ${d.q} não existe".`:d.rcode===2?'Resposta: "não consegui consultar (falha no servidor)".':`Resposta: "${d.q} é ${d.a}".`}
  if(l.dhcp)return{1:'Discover: "tem algum servidor DHCP aí? Preciso de um IP."',2:`Offer: "pode usar o IP ${l.dhcp.yi}".`,3:`Request: "quero o IP ${l.dhcp.req||''}".`,5:'ACK: "combinado, o IP é seu".',7:'Release: "não preciso mais deste IP".'}[l.dhcp.t];
  if(l.tcp){const t=l.tcp;if(t.retr)return'Retransmissão: o pacote foi enviado de novo porque o primeiro não teve resposta.';return t.flags==='S'?`Pedido de conexão TCP na porta ${t.dp} (1º passo).`:t.flags==='SA'?'Servidor aceita a conexão (2º passo).':t.flags==='A'?'Cliente confirma: conexão aberta (3º passo).':t.flags.includes('R')?`Porta ${t.sp} fechada: o servidor recusou (RST).`:''}
  return''}

/* ---------- bytes reais ---------- */
const mb=m=>m.replace(/\./g,'').match(/../g).map(h=>parseInt(h,16));
const ipb=s=>s.split('.').map(Number);const u16=n=>[(n>>>8)&255,n&255],u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function csum(b){let s=0;for(let i=0;i<b.length;i+=2)s+=(b[i]<<8)+(b[i+1]||0);while(s>>>16)s=(s&0xffff)+(s>>>16);return(~s)&0xffff}
const PN={icmp:1,tcp:6,udp:17};
function ipv4(src,dst,ttl,pn,pay,id){const h=[0x45,0,...u16(20+pay.length),...u16(id&0xffff),0x40,0,ttl&255,pn,0,0,...ipb(src),...ipb(dst)];const c=csum(h);h[10]=c>>8;h[11]=c&255;return h.concat(pay)}
function nomeDNS(q){const o=[];q.split('.').forEach(p=>{o.push(p.length);for(const ch of p)o.push(ch.charCodeAt(0))});o.push(0);return o}
function dnsB(d){let fl=d.resp?0x8180|(d.rcode||0):0x0100;const an=d.resp&&d.a?1:0;let b=[...u16(d.id),...u16(fl),0,1,...u16(an),0,0,0,0,...nomeDNS(d.q),0,1,0,1];if(an)b=b.concat([0xc0,0x0c,0,1,0,1,...u32(3600),0,4,...ipb(d.a)]);return b}
function dhcpB(d){const cli=[1,3,7].includes(d.t);const z=n=>new Array(n).fill(0);const b=[cli?1:2,1,6,0,...u32(d.xid>>>0),0,0,0,0,...ipb(d.ci||'0.0.0.0'),...ipb(d.yi&&!cli?d.yi:'0.0.0.0'),...z(4),...z(4),...mb(d.mac),...z(10),...z(64),...z(128),99,130,83,99,53,1,d.t];
  const op=(c,v)=>{b.push(c,v.length,...v)};if(d.srv)op(54,ipb(d.srv));if(d.req)op(50,ipb(d.req));if(d.lease)op(51,u32(d.lease));if(d.mask)op(1,ipb(d.mask));if(d.router)op(3,ipb(d.router));if(d.dns)op(6,ipb(d.dns));
  if(d.nome)op(12,[...d.nome].map(c=>c.charCodeAt(0)));if(d.t===1||d.t===3)op(55,[1,3,6,15]);b.push(255);return b}
function l4B(f){const l=f.l4||{},ip=f.ip;
  if(l.icmp){const c=l.icmp;let b;if(c.t===8||c.t===0){b=[c.t,0,0,0,...u16(c.id||1),...u16(c.seq||1),...[...'abcdefghijklmnopqrstuvwabcdefghi'].map(x=>x.charCodeAt(0))]}
    else{const o=c.orig||{src:ip.dst,dst:ip.src,ttl:1,id:1,seq:1};const oi=[8,0,0,0,...u16(o.id||1),...u16(o.seq||1)];const ck=csum(oi);oi[2]=ck>>8;oi[3]=ck&255;b=[c.t,c.code||0,0,0,0,0,0,0,...ipv4(o.src,o.dst,o.ttl||1,1,oi,o.seq||1)]}
    const ck=csum(b);b[2]=ck>>8;b[3]=ck&255;return b}
  if(l.udp){const pay=l.dns?dnsB(l.dns):l.dhcp?dhcpB(l.dhcp):[];return[...u16(l.udp.sp),...u16(l.udp.dp),...u16(8+pay.length),0,0,...pay]}
  if(l.tcp){const t=l.tcp;let fl=0;if(t.flags.includes('F'))fl|=1;if(t.flags.includes('S'))fl|=2;if(t.flags.includes('R'))fl|=4;if(t.flags.includes('P'))fl|=8;if(t.flags.includes('A'))fl|=16;
    const h=[...u16(t.sp),...u16(t.dp),...u32(t.seq>>>0),...u32(t.ack>>>0),0x50,fl,...u16(t.flags==='SA'?65160:64240),0,0,0,0];
    const ph=[...ipb(ip.src),...ipb(ip.dst),0,6,...u16(h.length)];const ck=csum(ph.concat(h));h[16]=ck>>8;h[17]=ck&255;return h}
  return[]}
function bytes(f){if(f._b)return f._b;let et,pay;
  if(f.eth==='arp'){const a=f.arp;et=0x0806;pay=[0,1,8,0,6,4,...u16(a.op),...mb(a.sha),...ipb(a.spa),...mb(a.tha),...ipb(a.tpa)]}
  else if(f.eth==='ip'){et=0x0800;const pn=PN[f.ip.proto]||0;const id=((f.n||1)*977+(f.ip.ttl||0))&0xffff;pay=ipv4(f.ip.src,f.ip.dst,f.ip.ttl,pn,l4B(f),id)}
  else if(f.eth==='lacp'){const a=f.lacp;et=0x8809;const st=(a.ativo?1:0)|4|(a.sync?8|16|32:0)|(a.sync?0:64);const pst=a.sync?(1|4|8|16|32):0;
    pay=[1,1,1,20,...u16(32768),...mb(a.sys),...u16(a.key),...u16(32768),...u16(a.port),st,0,0,0,2,20,...u16(a.sync?32768:0),...mb(a.parc),...u16(a.sync?a.key:0),...u16(a.sync?32768:0),...u16(a.pport),pst,0,0,0,3,16,0,0,...new Array(12).fill(0),0,0,...new Array(50).fill(0)]}
  else if(f.eth==='stp'){const s=f.stp;const bp=[0,0,2,2,0x3c,...u16(s.root.prio),...mb(s.root.mac),...u32(s.custo),...u16(s.br.prio),...mb(s.br.mac),...u16(s.port),...u16(s.custo?256:0),...u16(20*256),...u16(2*256),...u16(15*256),0];
    pay=[0x42,0x42,0x03,...bp];et=pay.length}
  let b=[...mb(f.dst),...mb(f.src)];if(f.vlan!=null)b.push(0x81,0,...u16(f.vlan));b.push(...u16(et),...pay);while(b.length<(f.vlan!=null?64:60))b.push(0);f._b=b;return b}
function hex(f){const b=bytes(f),L=[];for(let i=0;i<b.length;i+=16){const p=b.slice(i,i+16);L.push(hx(i,4)+'  '+p.map(x=>hx(x,2)).join(' ').padEnd(48)+'  '+p.map(x=>x>=32&&x<127?String.fromCharCode(x):'.').join(''))}return L.join('\n')}
const T0=Date.UTC(2026,9,30,10,0,0)/1000;
function pcap(frames){const out=[0xd4,0xc3,0xb2,0xa1,2,0,4,0,0,0,0,0,0,0,0,0,0xff,0xff,0,0,1,0,0,0];const le32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  for(const f of frames){const b=bytes(f);const t=T0+f.t;const s=Math.floor(t),us=Math.round((t-s)*1e6)%1000000;out.push(...le32(s),...le32(us),...le32(b.length),...le32(b.length),...b)}return new Uint8Array(out)}

/* ---------- filtros de exibição (sintaxe do Wireshark) ---------- */
const CAMPOS=new Set(('frame frame.number frame.len eth eth.src eth.dst eth.addr vlan vlan.id arp arp.opcode arp.src.proto_ipv4 arp.dst.proto_ipv4 arp.src.hw_mac '+
  'ip ip.src ip.dst ip.addr ip.ttl ip.proto icmp icmp.type icmp.code udp udp.port udp.srcport udp.dstport tcp tcp.port tcp.srcport tcp.dstport '+
  'tcp.flags.syn tcp.flags.ack tcp.flags.reset tcp.flags.fin tcp.analysis.retransmission dns dns.qry.name dns.a dns.id dns.flags.response dns.flags.rcode '+
  'dhcp bootp dhcp.option.dhcp dhcp.hw.mac_addr dhcp.ip.your stp lacp slowprotocols').split(' '));
const TIPO_IP=new Set(['ip.src','ip.dst','ip.addr','arp.src.proto_ipv4','arp.dst.proto_ipv4','dns.a','dhcp.ip.your']);
const TIPO_MAC=new Set(['eth.src','eth.dst','eth.addr','arp.src.hw_mac','dhcp.hw.mac_addr']);const TIPO_TXT=new Set(['dns.qry.name']);
function campos(f){if(f._c)return f._c;const r={};const set=(k,v)=>{(r[k]=r[k]||[]).push(v)};
  set('frame',1);set('frame.number',f.n);set('frame.len',bytes(f).length);set('eth',1);set('eth.src',mac(f.src));set('eth.dst',mac(f.dst));set('eth.addr',mac(f.src));set('eth.addr',mac(f.dst));
  if(f.vlan!=null){set('vlan',1);set('vlan.id',f.vlan)}
  if(f.eth==='arp'){const a=f.arp;set('arp',1);set('arp.opcode',a.op);set('arp.src.proto_ipv4',a.spa);set('arp.dst.proto_ipv4',a.tpa);set('arp.src.hw_mac',mac(a.sha))}
  if(f.eth==='stp')set('stp',1);if(f.eth==='lacp'){set('lacp',1);set('slowprotocols',1)}
  if(f.eth==='ip'){const ip=f.ip,l=f.l4||{};set('ip',1);set('ip.src',ip.src);set('ip.dst',ip.dst);set('ip.addr',ip.src);set('ip.addr',ip.dst);set('ip.ttl',ip.ttl);set('ip.proto',PN[ip.proto]);
    if(l.icmp){set('icmp',1);set('icmp.type',l.icmp.t);set('icmp.code',l.icmp.code||0)}
    if(l.udp){set('udp',1);set('udp.srcport',l.udp.sp);set('udp.dstport',l.udp.dp);set('udp.port',l.udp.sp);set('udp.port',l.udp.dp)}
    if(l.tcp){const t=l.tcp;set('tcp',1);set('tcp.srcport',t.sp);set('tcp.dstport',t.dp);set('tcp.port',t.sp);set('tcp.port',t.dp);
      set('tcp.flags.syn',t.flags.includes('S')?1:0);set('tcp.flags.ack',t.flags.includes('A')?1:0);set('tcp.flags.reset',t.flags.includes('R')?1:0);set('tcp.flags.fin',t.flags.includes('F')?1:0);if(t.retr)set('tcp.analysis.retransmission',1)}
    if(l.dns){set('dns',1);set('dns.qry.name',l.dns.q);set('dns.id',l.dns.id);set('dns.flags.response',l.dns.resp?1:0);if(l.dns.resp)set('dns.flags.rcode',l.dns.rcode||0);if(l.dns.a)set('dns.a',l.dns.a)}
    if(l.dhcp){set('dhcp',1);set('bootp',1);set('dhcp.option.dhcp',l.dhcp.t);set('dhcp.hw.mac_addr',mac(l.dhcp.mac));if(l.dhcp.yi)set('dhcp.ip.your',l.dhcp.yi)}}
  f._c=r;return r}
function normMac(v){const h=v.toLowerCase().replace(/[^0-9a-f]/g,'');return h.length===12?h.match(/../g).join(':'):null}
function comparador(campo,op,raw){let v=raw.replace(/^"(.*)"$/,'$1');
  if(TIPO_IP.has(campo)){const m=v.match(/^(\d+\.\d+\.\d+\.\d+)(?:\/(\d{1,2}))?$/);if(!m||!M.ehIP(m[1]))throw`"${raw}" não é um IP válido (ex.: 10.10.1.20 ou 10.10.20.0/24)`;
    const len=m[2]!=null?+m[2]:32;if(len>32)throw'Máscara /'+len+' inválida';const mk=M.maskDe(len),n=M.ip2n(m[1]);
    return(x,o)=>{const a=M.ip2n(x);if(o==='eq')return M.naRede(x,m[1],mk);if(o==='gt')return a>n;if(o==='lt')return a<n;if(o==='ge')return a>=n;if(o==='le')return a<=n;if(o==='contains')return x.includes(v);return false}}
  if(TIPO_MAC.has(campo)){const mm=normMac(v);if(!mm&&op!=='contains')throw`"${raw}" não é um MAC válido (ex.: 00:50:56:aa:20:01)`;return(x,o)=>o==='contains'?x.includes(v.toLowerCase()):x===mm}
  if(TIPO_TXT.has(campo)){v=v.toLowerCase();return(x,o)=>o==='contains'?x.includes(v):o==='eq'?x===v:false}
  const n=/^0x[0-9a-f]+$/i.test(v)?parseInt(v,16):/^\d+$/.test(v)?+v:v==='true'?1:v==='false'?0:NaN;if(isNaN(n))throw`"${raw}" não é um número`;
  return(x,o)=>o==='eq'?x===n:o==='gt'?x>n:o==='lt'?x<n:o==='ge'?x>=n:o==='le'?x<=n:false}
const OPS={'==':'eq',eq:'eq','!=':'ne',ne:'ne','>':'gt',gt:'gt','<':'lt',lt:'lt','>=':'ge',ge:'ge','<=':'le',le:'le',contains:'contains'};
function compilar(txt){txt=String(txt||'').trim();if(!txt)return{ok:true,fn:()=>true,vazio:true};
  const toks=[],re=/\s*(\(|\)|&&|\|\||==|!=|>=|<=|>|<|!|"[^"]*"|[A-Za-z0-9_.:\/-]+)/y;let pos=0;
  while(pos<txt.length){re.lastIndex=pos;const m=re.exec(txt);if(!m){if(!txt.slice(pos).trim())break;return{ok:false,erro:`Caractere inesperado: "${txt.slice(pos).trim().slice(0,8)}"`}}toks.push(m[1]);pos=re.lastIndex}
  let i=0;const peek=()=>toks[i],next=()=>toks[i++];
  const pOr=()=>{let a=pAnd();while(peek()&&/^(\|\||or)$/i.test(peek())){next();const b=pAnd(),x=a;a=f=>x(f)||b(f)}return a};
  const pAnd=()=>{let a=pNot();while(peek()&&/^(&&|and)$/i.test(peek())){next();const b=pNot(),x=a;a=f=>x(f)&&b(f)}return a};
  const pNot=()=>{if(peek()&&/^(!|not)$/i.test(peek())){next();const a=pNot();return f=>!a(f)}return pPrim()};
  const pPrim=()=>{const t=next();if(t===undefined)throw'Filtro incompleto';if(t==='('){const a=pOr();if(next()!==')')throw'Falta fechar o parêntese';return a}
    const campo=t.toLowerCase();if(!CAMPOS.has(campo))throw`Campo desconhecido: "${t}". Tente: icmp, arp, dns, dhcp, tcp, ip.addr == 10.10.1.20`;
    const op=peek()&&OPS[peek().toLowerCase()];if(!op)return f=>!!campos(f)[campo];next();const v=next();if(v===undefined)throw`Falta o valor depois de "${t} ${toks[i-1]}"`;
    const cmp=comparador(campo,op,v);return f=>{const vs=campos(f)[campo]||[];return op==='ne'?!vs.some(x=>cmp(x,'eq')):vs.some(x=>cmp(x,op))}};
  try{const fn=pOr();if(i<toks.length)throw`Sobrou "${toks[i]}" no fim. Use && ou || para juntar condições.`;return{ok:true,fn}}catch(e){return{ok:false,erro:String(e)}}}

/* ---------- detalhes por camada ---------- */
function nomesMac(st){if(st._nm&&st._nm.v===st.ver)return st._nm.m;const m={};const D=st.devs;
  for(const d of Object.values(D)){if(M.ehEp(d))m[d.mac]=d.nome;else if(M.ehSw(d)){m[d.mac]=d.nome;for(const p of Object.keys(d.ifs))m[incMac(d.mac,M.pid(p))]=d.nome+' '+p}}
  for(const v of[1,10,20,30,99,100])m[M.macDe(st,'CORE','Vlan'+v)]='CORE-01 Vlan'+v;m[M.macDe(st,'CORE','Gi1/0/1')]='CORE-01 Gi1/0/1';m['0009.0f09.0001']='FGT-HVC port1';m['0009.0f09.0002']='FGT-HVC port2';m['e8b7.4801.0001']='Operadora';
  st._nm={v:st.ver,m};return m}
function detalhes(st,f){const nm=nomesMac(st);const N=m=>m==='ffff.ffff.ffff'?'Broadcast (todos)':m==='0000.0000.0000'?'00:00:00:00:00:00 (desconhecido)':mac(m)+(nm[m]?` (${nm[m]})`:'');
  const b=bytes(f),l=f.l4||{},out=[];const C=(t,linhas,exp)=>out.push({t,linhas,exp});
  C(`Quadro ${f.n}: ${b.length} bytes no cabo`,[['Capturado em',pontoNome(st,st.cap.ix)],['Protocolos',['eth',f.vlan!=null?'vlan':null,f.eth==='ip'?'ip':f.eth,l.icmp?'icmp':l.udp?'udp':l.tcp?'tcp':null,l.dns?'dns':l.dhcp?'dhcp':null].filter(Boolean).join(':')]],'O quadro é o pacote inteiro, como passou neste cabo.');
  C(`Ethernet II, Src: ${mac(f.src)}, Dst: ${f.dst==='ffff.ffff.ffff'?'Broadcast':mac(f.dst)}`,[['Destino (MAC)',N(f.dst)],['Origem (MAC)',N(f.src)],['Tipo',f.eth==='ip'?'IPv4 (0x0800)':f.eth==='arp'?'ARP (0x0806)':f.eth==='lacp'?'Slow Protocols (0x8809)':'802.3 + LLC (STP)']],
    'Camada 2: endereço físico (MAC) de quem mandou e de quem recebe NESTE trecho. A cada roteador o MAC muda; o IP de origem e destino não.');
  if(f.vlan!=null)C(`802.1Q Virtual LAN, PRI: 0, DEI: 0, ID: ${f.vlan}`,[['VLAN',String(f.vlan)]],'Etiqueta de VLAN. Só aparece em porta trunk, para o switch do outro lado saber de qual VLAN é o quadro.');
  if(f.eth==='arp'){const a=f.arp;C(`Address Resolution Protocol (${a.op===1?'request':'reply'})`,[['Opcode',a.op===1?'1 (pergunta)':'2 (resposta)'],['MAC de quem envia',N(a.sha)],['IP de quem envia',a.spa],['MAC procurado',N(a.tha)],['IP procurado',a.tpa]],
    'ARP descobre o MAC a partir do IP, só dentro da mesma rede. A pergunta vai para todos; só o dono do IP responde.')}
  if(f.eth==='stp'){const s=f.stp;C('Spanning Tree Protocol (RSTP)',[['Raiz (root)',`${s.root.prio-s.v} / VLAN ${s.v} / ${N(s.root.mac)}`],['Custo até a raiz',String(s.custo)],['Ponte que envia',`${s.br.prio-s.v} / ${N(s.br.mac)}`],['Porta',`0x${hx(s.port,4)}`],['Hello',' 2 s · Max Age 20 s · Forward Delay 15 s']],
    'BPDU: mensagem que os switches trocam para montar a árvore sem loops. Quem tem o menor ID vira raiz; o resto calcula o caminho até ela.')}
  if(f.eth==='lacp'){const a=f.lacp;C('Link Aggregation Control Protocol',[['Ator (quem envia)',`${N(a.sys)} · porta ${a.port} · chave ${a.key}`],['Modo',a.ativo?'active (inicia a negociação)':'passive (só responde)'],['Parceiro',a.sync?`${N(a.parc)} · porta ${a.pport}`:'nenhum (o outro lado não fala LACP)'],['Situação',a.sync?'em sincronia: link agregado':'fora de sincronia: link suspenso']],
    'LACP negocia o EtherChannel (vários cabos como um só). Se o outro lado não responde, o switch suspende o link.')}
  if(f.eth==='ip'){const ip=f.ip;C(`Internet Protocol Version 4, Src: ${ip.src}, Dst: ${ip.dst}`,[['Origem (IP)',ip.src],['Destino (IP)',ip.dst],['TTL',String(ip.ttl)],['Protocolo',`${ip.proto.toUpperCase()} (${PN[ip.proto]})`]],
    'Camada 3: quem é a origem e o destino FINAL. O TTL cai 1 a cada roteador; se chegar a 0, o pacote morre (é assim que o tracert funciona).');
    if(l.icmp){const c=l.icmp;C('Internet Control Message Protocol',[['Tipo',{8:'8 (Echo request: pedido de ping)',0:'0 (Echo reply: resposta)',3:'3 (Destination unreachable: sem caminho)',11:'11 (Time exceeded: TTL acabou)'}[c.t]],['Código',String(c.code||0)],...(c.t===8||c.t===0?[['Sequência',String(c.seq)]]:[])],
      'ICMP é o protocolo de "aviso" da rede: o ping e as mensagens de erro dos roteadores.')}
    if(l.udp)C(`User Datagram Protocol, Src Port: ${l.udp.sp}, Dst Port: ${l.udp.dp}`,[['Porta de origem',String(l.udp.sp)],['Porta de destino',String(l.udp.dp)+(l.udp.dp===53||l.udp.sp===53?' (DNS)':l.udp.dp===67||l.udp.dp===68?' (DHCP)':'')]],'Camada 4 sem conexão: manda e pronto. DNS usa a porta 53; DHCP, 67 (servidor) e 68 (cliente).');
    if(l.tcp){const t=l.tcp;C(`Transmission Control Protocol, Src Port: ${t.sp}, Dst Port: ${t.dp}`,[['Porta de origem',String(t.sp)],['Porta de destino',String(t.dp)+({104:' (DICOM)',443:' (HTTPS)',3389:' (RDP)',22:' (SSH)'}[t.dp]||'')],['Flags',flagsTxt(t.flags)],['Sequência',relSeq(t)],...(t.retr?[['Análise','Retransmissão (o pacote anterior se perdeu)']]:[])],
      'TCP abre conexão em 3 passos: SYN → SYN, ACK → ACK. RST = recusado (porta fechada). Retransmissão = algo no caminho está perdendo pacotes.')}
    if(l.dns){const d=l.dns;C(`Domain Name System (${d.resp?'response':'query'})`,[['ID da transação',`0x${hx(d.id,4)}`],['Tipo',d.resp?'Resposta':'Pergunta'],['Nome',d.q+' (tipo A: endereço IPv4)'],...(d.resp?[['Código',{0:'0 (sem erro)',2:'2 (falha no servidor)',3:'3 (nome não existe)'}[d.rcode||0]],...(d.a?[['Resposta',d.a]]:[])]:[])],
      'O ID liga a resposta à pergunta certa. Resposta com código 3 = o servidor respondeu, mas o nome não existe; sem resposta nenhuma = servidor fora ou sem caminho.')}
    if(l.dhcp){const d=l.dhcp;C(`Dynamic Host Configuration Protocol (${DHCPT[d.t]})`,[['Tipo',`${d.t} (${DHCPT[d.t]})`],['Transação',`0x${hx(d.xid>>>0,8)}`],['MAC do cliente',N(d.mac)],...(d.yi?[['IP oferecido',d.yi]]:[]),...(d.req?[['IP pedido',d.req]]:[]),...(d.srv?[['Servidor DHCP',d.srv]]:[]),
      ...(d.mask?[['Máscara',d.mask],['Gateway (router)',d.router],['DNS',d.dns],['Validade',`${d.lease/3600} h`]]:[])],
      'DHCP em 4 passos (DORA): Discover → Offer → Request → ACK. Só Discover, sem Offer = ninguém deu IP: o PC fica com 169.254.')}}
  return out}

const Captura={pontos,pontoDe,pontoNome,iniciar,parar,proto,info,cor,orig,dest,traducao,bytes,hex,pcap,compilar,detalhes,campos,mac};
if(typeof module!=='undefined'&&module.exports)module.exports=Captura;else raiz.Captura=Captura;
})(typeof window!=='undefined'?window:globalThis);
