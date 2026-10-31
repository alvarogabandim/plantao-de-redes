/* Plantão de Redes · cli.js (Fase 1)
 * Consoles dos equipamentos: Cisco IOS (CORE-01, SW-1A, SW-3A), FortiOS (FGT-HVC),
 * Windows (PCs e servidores) e o painel de rede do tomógrafo.
 * Cada comando lê ou altera o estado do motor; nada é roteirizado. */
(function (raiz) {
'use strict';
const M=raiz.Motor||(typeof require!=='undefined'?require('./motor.js'):null);
const nl='\n';
const pad=(s,n)=>String(s).padEnd(n);
const lpad=(s,n)=>String(s).padStart(n);

/* ---------- casamento de comandos com abreviação (estilo IOS) ---------- */
function pref(t,w){t=t.toLowerCase();return t.length>0&&w.toLowerCase().startsWith(t)}
function casar(toks,pat){const P=pat.split(' ');const cap=[];let i=0;
  for(const p of P){
    if(p==='*'){cap.push(toks.slice(i).join(' '));i=toks.length;continue}
    const opt=p.startsWith('[');const w=opt?p.slice(1,-1):p;
    if(i>=toks.length){if(opt)continue;return null}
    const t=toks[i];
    if(w==='<if>'){let n=M.normIf(t),u=1;if(!n&&i+1<toks.length){n=M.normIf(t+toks[i+1]);u=2}if(!n)return null;cap.push(n);i+=u;continue}
    if(w==='<n>'){if(!/^\d+$/.test(t))return null;cap.push(+t);i++;continue}
    if(w==='<ip>'){if(!M.ehIP(t))return null;cap.push(t);i++;continue}
    if(w==='<w>'){cap.push(t);i++;continue}
    if(w.includes('|')){const o=w.split('|').find(x=>pref(t,x));if(!o)return null;cap.push(o);i++;continue}
    if(!pref(t,w)){if(opt)continue;return null}i++}
  if(i<toks.length)return null;return cap}

/* ---------- utilidades ---------- */
function T(st,id){st.term=st.term||{};return st.term[id]||(st.term[id]={modo:'exec',ifs:[],vlan:null,acl:null,fos:[]})}
const BASE=Date.UTC(2026,9,30,10,0,0);
const MES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtTs(t){const d=new Date(BASE+Math.floor(t*1000));const z=n=>String(n).padStart(2,'0');return`*${MES[d.getUTCMonth()]} ${d.getUTCDate()} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3,'0')}`}
function macWin(m){return m.replace(/\./g,'').match(/../g).join('-').toUpperCase()}
function macDash(m){return m.replace(/\./g,'').match(/../g).join('-').toLowerCase()}
function sviMac(v){return'00a1.c0de.00'+(+v).toString(16).padStart(2,'0')}
function macDe(st,o){const d=st.devs[o.dev];if(M.ehEp(d))return d.mac;if(/^Vlan/.test(o.ifn))return sviMac(o.ifn.slice(4));if(d.tipo==='l3')return'00a1.c0de.0101';if(d.tipo==='fw')return o.ifn==='port1'?'0009.0f09.0001':'0009.0f09.0002';return'e8b7.4801.0001'}
const curto=n=>n.startsWith('Gi')?'Gig '+n.slice(2):n;
function portasOrd(d){return Object.keys(d.ifs).sort((a,b)=>M.ordemPorta(a)-M.ordemPorta(b))}
function nomeEp(st,id){return st.devs[id].nome}

/* ---------- aplicar mudança: recalcula a rede e gera os logs de interface ---------- */
function snap(st){const m={};for(const d of Object.values(st.devs))if(M.ehSw(d)){for(const n of Object.keys(d.ifs))m[d.id+'|'+n]=st.l2.porta[d.id+'|'+n];if(d.tipo==='l3')for(const v in d.svis)m[d.id+'|Vlan'+v]=d.svis[v].shut?'disabled':st.l2.sviUp[v]?'connected':'notconnect'}return m}
const cls=s=>s==='disabled'?'admin':(s==='connected'||s==='inactive')?'up':s==='suspended'?'susp':'down';
function guardas(st){const out=[];for(const d of Object.values(st.devs)){if(!M.ehSw(d))continue;for(const[n,p]of Object.entries(d.ifs)){if(!p.bpduguard||p.bpdufilter||p.errdis||p.shut)continue;
  const L=st.links.find(l=>(l.a[0]===d.id&&l.a[1]===n)||(l.b[0]===d.id&&l.b[1]===n));if(!L)continue;const o=L.a[0]===d.id&&L.a[1]===n?L.b:L.a;const od=st.devs[o[0]];
  if(M.ehSw(od)&&!od.ifs[o[1]].bpdufilter&&!od.ifs[o[1]].shut&&!od.ifs[o[1]].errdis){p.errdis='bpduguard';out.push([d.id,n])}}}return out}
function mudar(st,id,R,fn){const a=snap(st);const r=fn();const gs=guardas(st);M.atualizar(st);const b=snap(st);
  for(const[dev,n]of gs){const ms=[`%SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ${M.nomeLongo(n)} with BPDU Guard enabled. Disabling port.`,`%PM-4-ERR_DISABLE: bpduguard error detected on ${n}, putting ${n} in err-disable state`];ms.forEach(m=>{M.log(st,dev,m);if(dev===id)R.linhas.push(['sys',fmtTs(st.relogio)+': '+m])})}
  for(const k of Object.keys(b)){const x=cls(a[k]),y=cls(b[k]);if(x===y)continue;const[dev,n]=k.split('|');const L=M.nomeLongo(n);let ms;
    if(y==='admin')ms=[`%LINK-5-CHANGED: Interface ${L}, changed state to administratively down`,`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${L}, changed state to down`];
    else if(y==='up'&&x==='susp')ms=[`%EC-5-BUNDLE: Interface ${n} joined port-channel`];
    else if(y==='up')ms=[`%LINK-3-UPDOWN: Interface ${L}, changed state to up`,`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${L}, changed state to up`];
    else if(y==='susp')ms=[`%EC-5-L3DONTBNDL2: ${n} suspended: LACP currently not enabled on the remote port.`];
    else ms=[`%LINK-3-UPDOWN: Interface ${L}, changed state to down`,`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${L}, changed state to down`];
    ms.forEach(m=>{M.log(st,dev,m);if(dev===id)R.linhas.push(['sys',fmtTs(st.relogio)+': '+m])})}
  const d=st.devs[id];if(M.ehSw(d))d.naoSalvo=true;R.mudou=true;return r}

/* ================= ponto de entrada ================= */
function executar(st,id,linha){const d=st.devs[id];const R={linhas:[],anim:null,mudou:false,limpar:false};
  const s=String(linha).replace(/\s+$/,'');R.linhas.push(['cmd',[prompt(st,id),s]]);if(!s.trim())return R;
  const fn=M.ehEp(d)?(d.tipo==='med'?tomo:win):d.tipo==='fw'?fos:ios;
  try{fn(st,id,s.trim(),R)}catch(e){R.linhas.push(['bad','Erro interno do simulador: '+e.message]);if(typeof console!=='undefined')console.error(e)}
  return R}
function prompt(st,id){const d=st.devs[id],t=T(st,id);
  if(d.tipo==='med')return'TOMO-01 rede>';
  if(M.ehEp(d))return'C:\\Users\\'+(d.tipo==='srv'?'Administrador':'tecnico')+'>';
  if(d.tipo==='fw'){const p=t.fos[t.fos.length-1];if(!p)return'FGT-HVC #';if(p.chave!=null)return`FGT-HVC (${p.chave}) #`;return`FGT-HVC (${p.tab.split(' ').pop()}) #`}
  return d.nome+({exec:'>',priv:'#',config:'(config)#',if:t.ifs.length>1?'(config-if-range)#':'(config-if)#',vlan:'(config-vlan)#',acl:'(config-ext-nacl)#'}[t.modo])}

const ATALHOS={
  win:['ipconfig /all','ping 10.10.1.20','ping 8.8.8.8','nslookup pacs.hvc.local','tracert 8.8.8.8','arp -a','tnc 10.10.1.20 -port 443','ipconfig /renew'],
  med:['rede mostrar','ping 10.10.30.1','ping 10.10.1.20','dicom eco'],
  sw:['enable','show interfaces status','show vlan brief','show interfaces trunk','show spanning-tree','show etherchannel summary','show logging','show running-config'],
  l3:['enable','show ip interface brief','show ip route','show interfaces status','show etherchannel summary','show access-lists','show logging','ping 8.8.8.8'],
  fw:['get router info routing-table all','show firewall policy','show router static','execute ping 8.8.8.8',"diagnose sniffer packet any 'icmp' 4",'diagnose debug flow trace start 10']};
function atalhos(st,id){const d=st.devs[id];if(d.tipo==='med')return ATALHOS.med;if(M.ehEp(d))return ATALHOS.win;return ATALHOS[d.tipo]}

/* ================= Windows ================= */
const AJ_WIN=['Comandos deste PC (Windows):','  ipconfig  |  ipconfig /all  |  ipconfig /renew  |  ipconfig /release  |  ipconfig /flushdns',
  '  ping <ip ou nome> [-n N]       tracert <ip ou nome>        nslookup <nome> [servidor]','  arp -a                         tnc <ip ou nome> -port <porta>   (Test-NetConnection)',
  '  netsh interface ip set address "Ethernet" dhcp','  netsh interface ip set address "Ethernet" static <ip> <máscara> <gateway>',
  '  netsh interface ip set dns "Ethernet" dhcp      |  netsh interface ip set dns "Ethernet" static <ip>','  hostname  |  cls'].join(nl);
function ipconfigTxt(st,d,all){const c=M.cfgIP(st,d);const L=['','Configuração de IP do Windows',''];
  if(all)L.push('   Nome do host. . . . . . . . . . . . . . . . : '+d.nome,'   Sufixo DNS primário . . . . . . . . . . . . : hvc.local','   Tipo de nó. . . . . . . . . . . . . . . . . : híbrido','   Roteamento de IP ativado. . . . . . . . . . : não','');
  L.push('Adaptador Ethernet Ethernet:','');
  const desc=()=>{if(all)L.push('   Descrição . . . . . . . . . . . . . . . . . : Intel(R) Ethernet Connection I219-LM','   Endereço Físico . . . . . . . . . . . . . . : '+macWin(d.mac),'   DHCP Habilitado . . . . . . . . . . . . . . : '+(c.dhcp?'Sim':'Não'),'   Configuração Automática Habilitada. . . . . : Sim')};
  if(!c.up){L.push('   Estado da mídia . . . . . . . . . . . . . . : mídia desconectada','   Sufixo DNS específico de conexão. . . . . . :');desc();return L.join(nl)}
  L.push('   Sufixo DNS específico de conexão. . . . . . : '+(c.dhcp&&!c.apipa?'hvc.local':''));desc();
  if(c.apipa)L.push('   Endereço IPv4 de Configuração Automática. . : '+c.ip+'(Preferencial)');else L.push('   Endereço IPv4. . . . . . . . . . . . . . . : '+c.ip+(all?'(Preferencial)':''));
  L.push('   Máscara de Sub-rede . . . . . . . . . . . . : '+c.mask,'   Gateway Padrão. . . . . . . . . . . . . . . : '+(c.gw||''));
  if(all){if(c.dhcp&&!c.apipa)L.push('   Concessão Obtida. . . . . . . . . . . . . . : sexta-feira, 30 de outubro de 2026 07:02:11','   Servidor DHCP . . . . . . . . . . . . . . . : '+c.lease.servidor);
    L.push('   Servidores DNS. . . . . . . . . . . . . . . : '+(c.dns||''));if(c.dhcp&&d.nic.dnsManual)L.push('                                                 (DNS definido manualmente)')}
  return L.join(nl)}
function winPing(r,n){const alvo=r.nome?`${r.nome} [${r.ip}]`:r.ip;
  if(r.tipo==='midia'||r.tipo==='semrota_local')return'PING: falha na transmissão. Falha geral.';
  if(r.tipo==='nome')return`A solicitação ping não pôde encontrar o host ${r.alvo}. Verifique o nome e tente novamente.`;
  const L=['',`Disparando ${alvo} com 32 bytes de dados:`];let rec=0;const tempos=[];
  for(let i=0;i<n;i++){
    if(r.tipo==='ok'){if(r.lossy&&i%2===1){L.push('Esgotado o tempo limite do pedido.');continue}const ms=r.ms+(i%3===1?1:0)+(r.lossy?i*37:0);tempos.push(ms);rec++;L.push(`Resposta de ${r.ip}: bytes=32 ${ms<=1&&!r.lossy?'tempo<1ms':'tempo='+ms+'ms'} TTL=${r.ttl}`)}
    else if(r.tipo==='inac'){rec++;L.push(`Resposta de ${r.deIp}: Host de destino inacessível.`)}
    else if(r.tipo==='rede_inac'){rec++;L.push(`Resposta de ${r.deIp}: Rede de destino inacessível.`)}
    else L.push('Esgotado o tempo limite do pedido.')}
  L.push('',`Estatísticas do Ping para ${r.ip}:`,`    Pacotes: Enviados = ${n}, Recebidos = ${rec}, Perdidos = ${n-rec} (${Math.round((n-rec)/n*100)}% de`,'             perda),');
  if(tempos.length)L.push('Aproximar um número redondo de vezes em milissegundos:',`    Mínimo = ${Math.min(...tempos)}ms, Máximo = ${Math.max(...tempos)}ms, Média = ${Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length)}ms`);
  return L.join(nl)}
function winTrace(r){if(r.tipo==='midia'||r.tipo==='semrota_local')return'Não foi possível resolver o nome do sistema de destino.';
  if(r.tipo==='nome')return`Não foi possível resolver o nome do sistema de destino ${r.alvo}.`;
  const L=['',`Rastreando a rota para ${r.nome?r.nome+' ['+r.ip+']':r.ip}`,'com no máximo 30 saltos:',''];
  r.linhas.forEach((h,i)=>{const n=lpad(i+1,3);if(!h){L.push(`${n}     *        *        *     Esgotado o tempo limite do pedido.`);return}
    if(h.flag==='H'){L.push(`${n}  ${h.ip}  relatórios: Host de destino inacessível.`);return}
    if(h.flag==='N'){L.push(`${n}  ${h.ip}  relatórios: Rede de destino inacessível.`);return}
    const ms=i<2?'<1 ms':(i+(h.ip.startsWith('10.')?0:9))+' ms';L.push(`${n}  ${lpad(ms,6)}  ${lpad(ms,6)}  ${lpad(ms,6)}  ${h.ip}`)});
  L.push('','Rastreamento concluído.');return L.join(nl)}
function win(st,id,s,R){const d=st.devs[id];const o=t=>R.linhas.push(['out',t]),nt=t=>R.linhas.push(['note',t]),bad=t=>R.linhas.push(['bad',t]);const low=s.toLowerCase();let m;
  if(/^(ajuda|help|\?)$/.test(low))return o(AJ_WIN);
  if(low==='cls'||low==='clear'){R.limpar=true;return}
  if(low==='hostname')return o(d.nome);
  if(m=low.match(/^ipconfig(\s+\/all)?$/)){o(ipconfigTxt(st,d,!!m[1]));const c=M.cfgIP(st,d);
    if(c.apipa)nt('» 169.254.x.x = APIPA: o Windows pediu IP ao DHCP e ninguém respondeu.');if(!c.up)nt('» Mídia desconectada = sem link físico (cabo, porta do switch desligada ou bloqueada).');return}
  if(low==='ipconfig /renew'){if(d.tipo==='srv'||!d.nic.dhcp)return o('\nConfiguração de IP do Windows\n\nA operação falhou porque nenhum adaptador está no estado permissível para esta operação.'),nt('» O IP deste equipamento é fixo (estático): o DHCP não age aqui.');
    if(!M.cfgIP(st,d).up)return o('\nConfiguração de IP do Windows\n\nNão é possível executar nenhuma operação em Ethernet enquanto a mídia estiver desconectada.');
    const ok=M.renovar(st,d);R.mudou=true;if(!ok)return o('\nConfiguração de IP do Windows\n\nOcorreu um erro ao renovar a interface Ethernet: Não foi possível contatar o servidor DHCP. Tempo limite da solicitação esgotado.');return o(ipconfigTxt(st,d,false))}
  if(low==='ipconfig /release'){if(!d.nic.dhcp)return o('\nConfiguração de IP do Windows\n\nA operação falhou porque nenhum adaptador está no estado permissível para esta operação.');M.liberar(st,d);R.mudou=true;return o(ipconfigTxt(st,d,false).replace(/Endereço IPv4.*\n/,''))}
  if(low==='ipconfig /flushdns')return o('\nConfiguração de IP do Windows\n\nCache do DNS Resolver liberado com êxito.');
  if(m=s.match(/^ping\s+(?:-[nt]\s*(\d+)?\s+)?(\S+)(?:\s+-n\s+(\d+))?$/i)){const n=Math.min(10,+(m[1]||m[3]||4));const r=M.ping(st,id,m[2],{registrar:true});o(winPing(r,n));R.anim={trilha:r.trilha,ok:r.tipo==='ok'};
    if(r.tipo==='inac')nt('» Atenção: o Windows conta "Host de destino inacessível" como RECEBIDO (0% de perda), mas falhou. A resposta veio do próprio PC: ele não conseguiu entregar o pacote nem ao gateway.');
    if(r.tipo==='ok'&&r.lossy)nt('» Perda intermitente: o caminho existe, mas algum enlace está com erros. Olhe contadores de interface (CRC, colisões).');return}
  if(m=s.match(/^tracert\s+(?:-d\s+)?(\S+)$/i)){const r=M.traceroute(st,id,m[1],{registrar:true});o(winTrace(r));R.anim={trilha:r.trilha,ok:!!r.okFinal};if(r.cortado)nt('» O simulador parou após 3 saltos sem resposta. O último salto que respondeu é a pista: o problema está nele ou logo depois.');return}
  if(m=s.match(/^nslookup\s+(\S+)(?:\s+(\S+))?$/i)){const q=M.resolver(st,id,m[1],{registrar:true,servidor:m[2]});const L=[];
    if(q.motivo==='semdns')return o('*** Nenhum servidor DNS configurado neste adaptador.');
    if(q.motivo==='timeout'||q.motivo==='recusado'){L.push('DNS request timed out.','    timeout was 2 seconds.','Servidor:  UnKnown','Address:  '+q.srv,'','DNS request timed out.','    timeout was 2 seconds.',`*** Tempo limite da solicitação para UnKnown esgotado`);o(L.join(nl));nt('» Nenhuma resposta do servidor DNS: ou ele não existe, ou não há caminho até ele.');return}
    L.push('Servidor:  '+q.nomeSrv,'Address:  '+q.srv,'');
    if(q.ok){if(q.naoAut)L.push('Não é resposta autoritativa:');L.push('Nome:    '+m[1].toLowerCase(),'Address:  '+q.ip)}
    else if(q.motivo==='nx')L.push(`*** ${q.nomeSrv} não encontrou ${m[1]}: Non-existent domain`);
    else if(q.motivo==='servfail'){L.push(`*** ${q.nomeSrv} não encontrou ${m[1]}: Server failed`);}
    o(L.join(nl));if(q.motivo==='servfail')nt('» O DNS interno respondeu, mas não conseguiu consultar a internet (encaminhador 8.8.8.8). Problema de saída para a internet, não do DNS.');return}
  if(/^arp\s+-a$/i.test(s)){const c=M.cfgIP(st,d);if(!c.up||!c.ip)return o('Nenhuma entrada ARP encontrada.');const L=['',`Interface: ${c.ip} --- 0xb`,'  Endereço IP           Endereço físico       Tipo'];
    const sg=st.l2.seg.get('E:'+id);const ips=[c.gw,c.dns].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i);
    for(const ip of ips){const ow=st.own.get(ip);if(ow&&M.naRede(ip,c.ip,c.mask)&&st.l2.seg.get(ow.no)===sg&&!st.l2.stormSeg.has(sg))L.push(`  ${pad(ip,22)}${pad(macDash(macDe(st,ow)),22)}dinâmico`)}
    const bc=M.n2ip((M.ip2n(c.ip)|(~M.ip2n(c.mask)>>>0))>>>0);L.push(`  ${pad(bc,22)}${pad('ff-ff-ff-ff-ff-ff',22)}estático`,`  ${pad('224.0.0.22',22)}${pad('01-00-5e-00-00-16',22)}estático`);
    o(L.join(nl));if(c.gw&&!L.some(x=>x.includes(' '+c.gw+' ')))nt('» O gateway não aparece na tabela ARP: o PC perguntou "quem é '+c.gw+'?" e ninguém respondeu na rede local.');return}
  if(m=s.match(/^(?:test-netconnection|tnc)\s+(\S+)(?:\s+-port\s+(\d+))?$/i)){const porta=+(m[2]||0);
    if(!porta){const r=M.ping(st,id,m[1],{registrar:true});R.anim={trilha:r.trilha,ok:r.tipo==='ok'};return o(`\nComputerName           : ${m[1]}\nRemoteAddress          : ${r.ip||''}\nInterfaceAlias         : Ethernet\nSourceAddress          : ${M.cfgIP(st,d).ip||''}\nPingSucceeded          : ${r.tipo==='ok'?'True':'False'}`)}
    const r=M.conectar(st,id,m[1],porta,{registrar:true});const p=M.ping(st,id,r.ip||m[1]);R.anim={trilha:r.trilha||[],ok:r.ok};
    const L=[];if(r.motivo==='nome')return o(`AVISO: Falha na resolução do nome ${m[1]}`);if(!r.ok)L.push(`AVISO: TCP connect to (${r.ip} : ${porta}) failed`);if(!r.ok&&p.tipo!=='ok')L.push(`AVISO: Ping to ${r.ip} failed with status: TimedOut`);
    L.push('',`ComputerName           : ${m[1]}`,`RemoteAddress          : ${r.ip}`,`RemotePort             : ${porta}`,'InterfaceAlias         : Ethernet',`SourceAddress          : ${M.cfgIP(st,d).ip}`);
    if(!r.ok)L.push(`PingSucceeded          : ${p.tipo==='ok'?'True':'False'}`,`PingReplyDetails (RTT) : ${p.tipo==='ok'?p.ms+' ms':'0 ms'}`);L.push(`TcpTestSucceeded       : ${r.ok?'True':'False'}`);o(L.join(nl));
    if(!r.ok&&p.tipo==='ok')nt('» O ping responde mas a porta não: o caminho existe e algo filtra o serviço (ACL, firewall) ou o serviço não está escutando.');return}
  if(m=s.match(/^netsh\s+int(?:erface)?\s+ip(?:v4)?\s+set\s+address\s+(?:name=)?("?)([^"]+?)\1\s+(?:source=)?(dhcp|static)(?:\s+(?:address=)?(\S+)\s+(?:mask=)?(\S+)(?:\s+(?:gateway=)?(\S+))?)?$/i)){
    if(m[2].toLowerCase()!=='ethernet')return o('O nome do objeto especificado não foi encontrado.'),nt('» O adaptador deste PC se chama "Ethernet".');
    const n=d.nic;
    if(m[3].toLowerCase()==='dhcp'){if(d.tipo==='srv')return bad('» Servidor com IP fixo: não mude para DHCP.');if(!n.dhcp){if(n.dns)n.dnsManual=n.dns;n.dhcp=true;d.liberado=false;d.lease=null}M.atualizar(st);M.renovar(st,d);R.mudou=true;return o('Ok.')}
    if(!m[4]||!M.ehIP(m[4])||!M.mascaraOk(m[5]||'')||(m[6]&&!M.ehIP(m[6])))return o('Uso: netsh interface ip set address "Ethernet" static <ip> <máscara> <gateway>'),nt('» Confira IP, máscara e gateway (formato 10.10.20.50 255.255.255.0 10.10.20.1).');
    Object.assign(n,{dhcp:false,ip:m[4],mask:m[5],gw:m[6]||null,dns:n.dnsManual||(d.lease&&d.lease.dns)||n.dns});d.lease=null;M.atualizar(st);R.mudou=true;return o('Ok.')}
  if(m=s.match(/^netsh\s+int(?:erface)?\s+ip(?:v4)?\s+set\s+dns(?:servers)?\s+(?:name=)?("?)([^"]+?)\1\s+(?:source=)?(dhcp|static)(?:\s+(?:address=)?(\S+))?(?:\s+\S+)?$/i)){
    if(m[2].toLowerCase()!=='ethernet')return o('O nome do objeto especificado não foi encontrado.');const n=d.nic;
    if(m[3].toLowerCase()==='dhcp'){if(!n.dhcp)return o('Ok.'),nt('» Com IP fixo o DNS também precisa ser fixo: use "static 10.10.1.10".');n.dnsManual=null;R.mudou=true;st.own=M.donos(st);return o('Ok.')}
    if(!m[4]||!M.ehIP(m[4]))return o('Uso: netsh interface ip set dns "Ethernet" static <ip>');if(n.dhcp)n.dnsManual=m[4];else n.dns=m[4];R.mudou=true;return o('Ok.')}
  if(/^netsh/i.test(s))return o('O comando digitado não está correto. Veja: ajuda'),nt('» Formato: netsh interface ip set address "Ethernet" dhcp');
  if(/^(show|enable|conf|interface|execute|get|config)/i.test(s))nt('» Esse é um comando de switch/firewall. Troque de equipamento nas abas acima ou clique no mapa.');
  o(`'${s.split(/\s+/)[0]}' não é reconhecido como um comando interno\nou externo, um programa operável ou um arquivo em lotes.`);nt('» Digite ajuda para ver os comandos deste equipamento.')}

/* ================= painel do tomógrafo ================= */
function tomo(st,id,s,R){const d=st.devs[id],n=d.nic;const o=t=>R.linhas.push(['out',t]),nt=t=>R.linhas.push(['note',t]);const low=s.toLowerCase();let m;
  if(/^(ajuda|help|\?)$/.test(low))return o(['Painel de rede do fabricante (TOMO-01):','  rede mostrar','  rede definir ip <ip> mascara <máscara> gateway <gateway>','  rede definir gateway <ip>   |   rede definir dns <ip>','  ping <ip>','  dicom eco          (testa a associação DICOM com o PACS)'].join(nl));
  if(low==='cls'||low==='clear'){R.limpar=true;return}
  if(/^rede\s+mostr/.test(low)){const c=M.cfgIP(st,d);return o([`Interface .......... eth0 (link: ${c.up?'ativo, 1000 Mb/s':'INATIVO'})`,'Modo ............... estático (DHCP não suportado pelo fabricante)',`Endereço IP ........ ${n.ip}`,`Máscara ............ ${n.mask}`,`Gateway ............ ${n.gw||'-'}`,`DNS ................ ${n.dns||'-'}`,'AE Title local ..... TOMO01','Destino DICOM ...... PACSHVC @ 10.10.1.20 porta 104'].join(nl))}
  if(m=low.match(/^rede\s+definir\s+ip\s+(\S+)\s+mascara\s+(\S+)\s+gateway\s+(\S+)(?:\s+dns\s+(\S+))?$/)){if(!M.ehIP(m[1])||!M.mascaraOk(m[2])||!M.ehIP(m[3]))return o('ERRO: endereço inválido.');Object.assign(n,{ip:m[1],mask:m[2],gw:m[3]});if(m[4])n.dns=m[4];M.atualizar(st);R.mudou=true;return o('Configuração aplicada. Interface eth0 reiniciada.')}
  if(m=low.match(/^rede\s+definir\s+(gateway|dns)\s+(\S+)$/)){if(!M.ehIP(m[2]))return o('ERRO: endereço inválido.');n[m[1]==='gateway'?'gw':'dns']=m[2];M.atualizar(st);R.mudou=true;return o('Configuração aplicada. Interface eth0 reiniciada.')}
  if(m=low.match(/^ping\s+(\S+)$/)){const r=M.ping(st,id,m[1],{registrar:true});R.anim={trilha:r.trilha,ok:r.tipo==='ok'};
    if(r.tipo==='ok')return o(`PING ${r.ip}: 56 bytes\n`+[0,1,2,3].map(i=>r.lossy&&i%2?'(sem resposta)':`64 bytes de ${r.ip}: seq=${i} ttl=${r.ttl} tempo=${r.ms+(r.lossy?i*30:0)} ms`).join(nl)+`\n--- ${r.ip} ---\n4 enviados, ${r.lossy?2:4} recebidos`);
    if(r.tipo==='nome')return o('ping: nome desconhecido');return o(`PING ${r.ip||m[1]}: 56 bytes\n${r.tipo==='inac'?'De '+r.deIp+': destino inacessível\n'.repeat(4).trim():'(sem resposta)\n(sem resposta)\n(sem resposta)\n(sem resposta)'}\n--- ${r.ip||m[1]} ---\n4 enviados, 0 recebidos, 100% perda`)}
  if(/^dicom\s+eco/.test(low)){const r=M.conectar(st,id,'10.10.1.20',104,{registrar:true});R.anim={trilha:r.trilha||[],ok:r.ok};
    if(r.ok)return o('C-ECHO TOMO01 → PACSHVC @ 10.10.1.20:104\nAssociação aceita.\nC-ECHO-RSP status 0x0000 (Sucesso)'+(r.lossy?'\nAviso: 3 retransmissões TCP durante a associação.':''));
    return o('C-ECHO TOMO01 → PACSHVC @ 10.10.1.20:104\nFalha de associação: '+(r.motivo==='recusado'?'conexão recusada pelo destino.':'tempo esgotado aguardando resposta (30 s).'))}
  o('Comando desconhecido. Digite ajuda.')}

/* ================= Cisco IOS ================= */
function ajudaIos(t,d){const l3=d.tipo==='l3';
  if(t.modo==='exec'||t.modo==='priv')return['Modo '+(t.modo==='exec'?'usuário (>). Use enable para o modo privilegiado (#).':'privilegiado (#).'),
    '  show interfaces status | show interfaces <porta> | show interfaces trunk','  show vlan brief | show spanning-tree [vlan N] | show etherchannel summary',
    '  show mac address-table | show cdp neighbors | show logging','  show running-config [interface <porta>]'+(l3?' | show ip interface brief':''),
    ...(l3?['  show ip route | show access-lists | show ip dhcp binding','  ping <ip> | traceroute <ip>']:[]),'  configure terminal | write memory | exit'].join(nl);
  if(t.modo==='config')return['Configuração global:','  interface <porta>  |  interface range gi1/0/49 - 50'+(l3?'  |  interface vlan N':''),'  vlan N  |  no vlan N  |  spanning-tree vlan 1-4094 priority N',...(l3?['  ip route <rede> <máscara> <próximo-salto>  |  no ip route ...','  ip access-list extended <NOME>']:[]),'  end  |  exit  |  do <comando show>'].join(nl);
  if(t.modo==='if')return['Configuração de interface:','  shutdown | no shutdown | description <texto>','  switchport mode access|trunk | switchport access vlan N','  switchport trunk allowed vlan <lista> | add <lista> | remove <lista>  |  switchport trunk native vlan N',
    '  channel-group N mode active|passive|on | no channel-group','  speed auto|100|1000 | duplex auto|full|half','  spanning-tree portfast | spanning-tree bpduguard enable | spanning-tree bpdufilter enable (e "no ...")',...(l3?['  no switchport | ip address <ip> <máscara> | ip access-group <NOME> in|out']:[]),'  exit | end'].join(nl);
  if(t.modo==='vlan')return'  name <NOME>  |  exit  |  end';
  if(t.modo==='acl')return['ACL estendida:','  [seq] permit|deny ip|tcp|udp|icmp <origem> <destino> [eq <porta>]','     origem/destino: any | host <ip> | <rede> <curinga>','  no <seq>  |  exit  |  end'].join(nl);return''}
function ios(st,id,s,R){const d=st.devs[id],t=T(st,id);const o=x=>R.linhas.push(['out',x]);
  if(/^(\?|ajuda|help)$/i.test(s))return o(ajudaIos(t,d));
  const toks=s.split(/\s+/);let c;
  if(t.modo!=='exec'&&t.modo!=='priv'){if(c=casar(toks,'do *'))return iosExec(st,id,c[0],R,true);return iosConfig(st,id,toks,s,R)}
  return iosExec(st,id,s,R,false)}
function invalido(R,s){R.linhas.push(['bad','% Invalid input detected at \'^\' marker.']);R.linhas.push(['note','» Comando não reconhecido neste modo. Digite ? para ver os comandos aceitos.'])}
function iosExec(st,id,s,R,viaDo){const d=st.devs[id],t=T(st,id);const toks=s.split(/\s+/);let c;const o=x=>R.linhas.push(['out',x]),nt=x=>R.linhas.push(['note',x]);
  if(casar(toks,'enable')){if(!viaDo)t.modo='priv';return}
  if(casar(toks,'disable')){t.modo='exec';return}
  if(casar(toks,'configure terminal')||casar(toks,'configure')){if(t.modo==='exec'){R.linhas.push(['bad','% Invalid input detected at \'^\' marker.']);return nt('» Configurar exige o modo privilegiado: digite enable antes.')}t.modo='config';return o('Enter configuration commands, one per line.  End with CNTL/Z.')}
  if(casar(toks,'exit')||casar(toks,'logout')||casar(toks,'end')){if(t.modo==='priv')t.modo='exec';return}
  if(casar(toks,'write [memory]')||casar(toks,'copy running-config startup-config')){if(t.modo==='exec')return invalido(R);d.naoSalvo=false;R.mudou=true;return o('Building configuration...\n[OK]')}
  if(c=casar(toks,'ping <w>'))return iosPing(st,id,c[0],R);
  if(c=casar(toks,'traceroute <w>'))return iosTrace(st,id,c[0],R);
  if(toks[0]&&pref(toks[0],'show')&&toks[0].length>=2)return show(st,id,toks.slice(1),R);
  if(casar(toks,'clear mac address-table [dynamic]'))return;
  if(casar(toks,'reload'))return R.linhas.push(['bad','% Reload desativado no simulador (num switch de produção, isso derruba o andar inteiro).']);
  invalido(R,s)}
function iosPing(st,id,alvo,R){const o=x=>R.linhas.push(['out',x]),nt=x=>R.linhas.push(['note',x]);const d=st.devs[id];
  if(!M.ehIP(alvo)){o(`Translating "${alvo}"...domain server (255.255.255.255)\n% Unrecognized host or address, or protocol not running.`);return nt('» Este equipamento não tem DNS configurado: use o IP.')}
  const r=M.ping(st,id,alvo,{registrar:true});R.anim={trilha:r.trilha||[id],ok:r.tipo==='ok'};
  let sim='.....',n=0;if(r.tipo==='ok'){sim=r.lossy?'!.!.!':'!!!!!';n=r.lossy?3:5}else if(r.tipo==='rede_inac')sim='U.U.U';
  o(`Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${alvo}, timeout is 2 seconds:\n${sim}\nSuccess rate is ${n*20} percent (${n}/5)${n?`, round-trip min/avg/max = ${r.ms}/${r.ms+(r.lossy?30:0)}/${r.ms+(r.lossy?80:1)} ms`:''}`);
  if(d.tipo==='sw')nt('» O '+d.nome+' é só camada 2 neste laboratório (sem IP de gerência). Teste a partir do CORE-01 ou de um PC.');
  else nt('» "!" = resposta, "." = sem resposta, "U" = destino inalcançável avisado por um roteador.')}
function iosTrace(st,id,alvo,R){const o=x=>R.linhas.push(['out',x]);if(!M.ehIP(alvo))return o(`Translating "${alvo}"...domain server (255.255.255.255)\n% Unrecognized host or address, or protocol not running.`);
  const r=M.traceroute(st,id,alvo,{registrar:true});R.anim={trilha:r.trilha||[id],ok:!!r.okFinal};const L=['Type escape sequence to abort.',`Tracing the route to ${alvo}`,'VRF info: (vrf in name/id, vrf out name/id)'];
  if(r.tipo!=='ok')L.push('  1  *  *  *');else r.linhas.forEach((h,i)=>{if(!h)L.push(`  ${i+1}  *  *  *`);else{const ms=i+1+(h.ip.startsWith('10.')?0:9);L.push(`  ${i+1} ${h.ip} ${ms} msec ${ms} msec ${ms+1} msec${h.flag==='N'?' !N':''}`)}});o(L.join(nl))}

/* ---------- show ---------- */
function statusIp(st,d,n){const s=st.l2.porta[d.id+'|'+n];if(s==='disabled')return['administratively down','down'];if(s==='connected'||s==='inactive')return['up','up'];if(s==='suspended')return['up','down'];return['down','down']}
function negDe(st,d,n){const lp=st.l2.lp.get(d.id+'|'+n);if(!lp||!st.l2.link[lp.ix].up)return null;const g=st.l2.link[lp.ix].neg;const a=lp.lado==='a';return{dup:a?g.dA:g.dB,autoD:a?g.aA:g.aB,spd:g.spd,autoS:a?g.sA:g.sB}}
function shIntStatus(st,d){const L=['','Port         Name               Status       Vlan       Duplex  Speed  Type'];
  for(const n of portasOrd(d)){const p=d.ifs[n];const stt=st.l2.porta[d.id+'|'+n];const vlan=p.mode==='routed'?'routed':p.mode==='trunk'?'trunk':String(p.vlan);
    let dup,spd;const g=negDe(st,d,n);
    if(n.startsWith('Po')){const po=st.l2.po[d.id+'|'+n];dup=po&&po.up?'a-full':'auto';spd=po&&po.up?'a-1000':'auto'}
    else if(g){dup=(g.autoD?'a-':'')+g.dup;spd=(g.autoS?'a-':'')+g.spd}else{dup=p.duplex;spd=p.speed}
    L.push(pad(n,13)+pad((p.desc||'').slice(0,18),19)+pad(stt,13)+pad(vlan,11)+pad(dup,8)+pad(spd,7)+(n.startsWith('Po')?'':'10/100/1000BaseTX'))}
  return L.join(nl)}
function shIpBrief(st,d){const L=['Interface              IP-Address      OK? Method Status                Protocol'];
  const linha=(n,ip,s)=>L.push(pad(n,23)+pad(ip||'unassigned',16)+'YES '+pad(ip?'manual':'unset',7)+pad(s[0],22)+s[1]);
  if(d.tipo==='l3')for(const v of Object.keys(d.svis).map(Number).sort((a,b)=>a-b)){const s=d.svis[v];linha('Vlan'+v,s.ip,s.shut?['administratively down','down']:st.l2.sviUp[v]?['up','up']:['up','down'])}
  for(const n of portasOrd(d)){const p=d.ifs[n];linha(M.nomeLongo(n),p.mode==='routed'?p.ip:null,statusIp(st,d,n))}return L.join(nl)}
function portaFwdVlans(st,d,n){const out=[];for(const v of Object.keys(st.l2.stp).map(Number)){const pp=st.l2.stp[v].papel[d.id+'|'+n];if(pp&&pp.s==='FWD')out.push(v)}return out}
function shTrunk(st,d){const ps=portasOrd(d).filter(n=>{const p=d.ifs[n];if(p.mode!=='trunk'||st.l2.porta[d.id+'|'+n]!=='connected')return false;if(!n.startsWith('Po')&&p.cg){const lp=st.l2.lp.get(d.id+'|'+n);const lk=lp&&st.l2.link[lp.ix];if(lk&&lk.lacp&&lk.lacp[lp.lado]==='P')return false}return true});
  if(!ps.length)return'';const L=['','Port        Mode             Encapsulation  Status        Native vlan'];ps.forEach(n=>L.push(pad(n,12)+pad('on',17)+pad('802.1q',15)+pad('trunking',14)+d.ifs[n].native));
  L.push('','Port        Vlans allowed on trunk');ps.forEach(n=>L.push(pad(n,12)+M.vlansTxt(d.ifs[n].allowed)));
  const ativas=n=>{const p=d.ifs[n];const a=(p.allowed||Object.keys(d.vlans).map(Number)).filter(v=>d.vlans[v]!==undefined);return a};
  L.push('','Port        Vlans allowed and active in management domain');ps.forEach(n=>L.push(pad(n,12)+M.vlansTxt(ativas(n))));
  L.push('','Port        Vlans in spanning tree forwarding state and not pruned');ps.forEach(n=>L.push(pad(n,12)+M.vlansTxt(portaFwdVlans(st,d,n))));return L.join(nl)}
function shVlan(st,d){const L=['','VLAN Name                             Status    Ports','---- -------------------------------- --------- -------------------------------'];
  for(const v of Object.keys(d.vlans).map(Number).sort((a,b)=>a-b)){const ps=portasOrd(d).filter(n=>!n.startsWith('Po')&&d.ifs[n].mode==='access'&&d.ifs[n].vlan===v&&!d.ifs[n].cg);
    const grupos=[];for(let i=0;i<ps.length;i+=4)grupos.push(ps.slice(i,i+4).join(', '));
    L.push(pad(v,5)+pad(d.vlans[v],33)+pad('active',10)+(grupos[0]||''));grupos.slice(1).forEach(g=>L.push(pad('',48)+g))}
  L.push(pad(1002,5)+pad('fddi-default',33)+'act/unsup',pad(1003,5)+pad('token-ring-default',33)+'act/unsup',pad(1004,5)+pad('fddinet-default',33)+'act/unsup',pad(1005,5)+pad('trnet-default',33)+'act/unsup');return L.join(nl)}
function shStp(st,d,vf){const R2=st.l2;const vl=new Set();
  for(const v of Object.keys(R2.stp).map(Number))if(R2.stp[v].devs.includes(d.id))vl.add(v);
  for(const n of Object.keys(d.ifs)){const p=d.ifs[n];if(p.mode==='access'&&R2.porta[d.id+'|'+n]==='connected')vl.add(p.vlan)}
  const lista=[...vl].filter(v=>!vf||v===vf).sort((a,b)=>a-b);if(!lista.length)return'No spanning tree instance exists.';const out=[];
  for(const v of lista){const res=R2.stp[v];const rootDev=res&&res.raiz[d.id]?res.raiz[d.id]:d.id;const rd=st.devs[rootDev];const ehRaiz=rootDev===d.id;
    const L=['',`VLAN${String(v).padStart(4,'0')}`,'  Spanning tree enabled protocol rstp',`  Root ID    Priority    ${rd.stpPrio+v}`,`             Address     ${rd.mac}`];
    if(ehRaiz)L.push('             This bridge is the root');else{const rp=res.rp[d.id];L.push(`             Cost        ${res.rc[d.id]}`,`             Port        ${M.pid(rp.p)} (${M.nomeLongo(rp.p)})`)}
    L.push('             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec','',`  Bridge ID  Priority    ${d.stpPrio+v}  (priority ${d.stpPrio} sys-id-ext ${v})`,`             Address     ${d.mac}`,'             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec','             Aging Time  300 sec','',
      'Interface           Role Sts Cost      Prio.Nbr Type','------------------- ---- --- --------- -------- --------------------------------');
    const rows=new Map();
    if(res)res.cands.forEach(c=>{for(const x of[c.A,c.B]){if(x.dev!==d.id)continue;const pp=res.papel[d.id+'|'+x.p];if(!pp)continue;const pf=d.ifs[x.p];rows.set(x.p,[pp.r,pp.s,M.custoPorta(R2,c.gi),(pf.portfast||pf.bpdufilter)?'P2p Edge':'P2p'])}});
    for(const n of Object.keys(d.ifs)){const p=d.ifs[n];if(rows.has(n))continue;if(p.mode==='access'&&p.vlan===v&&R2.porta[d.id+'|'+n]==='connected')rows.set(n,['Desg','FWD',4,p.portfast?'P2p Edge':'P2p'])}
    R2.logicas.forEach(g=>{if(!g.pvidInc)return;for(const[x,vv]of[[g.a,g.pvidInc[0]],[g.b,g.pvidInc[1]]])if(x.dev===d.id&&vv===v)rows.set(x.p,['Desg','BKN*',4,'P2p *PVID_Inc'])});
    [...rows.keys()].sort((a,b)=>M.ordemPorta(a)-M.ordemPorta(b)).forEach(n=>{const r=rows.get(n);L.push(pad(n,20)+pad(r[0],5)+pad(r[1],4)+pad(r[2],10)+pad('128.'+M.pid(n),9)+r[3])});
    out.push(L.join(nl))}
  return out.join(nl)}
function shEther(st,d){const L=['Flags:  D - down        P - bundled in port-channel','        I - stand-alone s - suspended','        H - Hot-standby (LACP only)','        R - Layer3      S - Layer2','        U - in use      f - failed to allocate aggregator','','        M - not in use, minimum links not met','        u - unsuitable for bundling','        w - waiting to be aggregated','        d - default port',''];
  const pos=Object.keys(d.ifs).filter(n=>n.startsWith('Po'));L.push(`Number of channel-groups in use: ${pos.length}`,`Number of aggregators:           ${pos.length}`,'','Group  Port-channel  Protocol    Ports','------+-------------+-----------+-----------------------------------------------');
  for(const n of pos){const po=st.l2.po[d.id+'|'+n]||{up:false,membros:[]};const prot=po.membros.length&&po.membros.every(m=>d.ifs[m].cg.mode==='on')?'-':'LACP';
    const ms=po.membros.map(m=>{const lp=st.l2.lp.get(d.id+'|'+m);const lk=lp&&st.l2.link[lp.ix];let f='D';if(lk&&lk.up&&lk.lacp)f=lk.lacp[lp.lado]||'D';else if(lk&&lk.up)f='I';return pad(m+'('+f+')',16)}).join('');
    L.push(pad(n.slice(2),7)+pad(n+'(S'+(po.up?'U':'D')+')',16)+pad(prot,10)+ms)}return L.join(nl)}
function shRoute(st,d){const rs=M.rotas(st,d.id);const def=rs.find(r=>r.len===0);const L=['Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP','       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area','       * - candidate default, U - per-user static route','',def?`Gateway of last resort is ${def.nh} to network 0.0.0.0`:'Gateway of last resort is not set',''];
  if(def)L.push(`S*    0.0.0.0/0 [1/0] via ${def.nh}`);const outras=rs.filter(r=>r.len>0).sort((a,b)=>M.ip2n(a.rede)-M.ip2n(b.rede)||a.len-b.len);
  const nC=outras.filter(r=>r.t==='C').length;L.push(`      10.0.0.0/8 is variably subnetted, ${outras.length+nC} subnets, ${new Set(outras.map(r=>r.len).concat(nC?[32]:[])).size} masks`);
  for(const r of outras){if(r.t==='C'){L.push(`C        ${r.rede}/${r.len} is directly connected, ${M.nomeLongo(r.ifn)}`);L.push(`L        ${M.ipDe(st,d.id,r.ifn)}/32 is directly connected, ${M.nomeLongo(r.ifn)}`)}else L.push(`S        ${r.rede}/${r.len} [1/0] via ${r.nh}`)}return L.join(nl)}
function fmtEnd(x){return x.any?'any':x.wc==='0.0.0.0'?'host '+x.ip:x.ip+' '+x.wc}
const NOMEPORTA={53:'domain',80:'www',22:'22',443:'443'};
function fmtAce(e){if(e.remark)return'remark '+e.remark;return`${e.acao} ${e.proto} ${fmtEnd(e.src)} ${fmtEnd(e.dst)}${e.porta?' eq '+(NOMEPORTA[e.porta]||e.porta):''}`}
function shAcl(st,d){const ns=Object.keys(d.acls);if(!ns.length)return'';const L=[];for(const n of ns){L.push('Extended IP access list '+n);for(const e of[...d.acls[n].regras].sort((a,b)=>a.seq-b.seq))L.push(`    ${e.seq} ${fmtAce(e)}${e.hits?` (${e.hits} match${e.hits>1?'es':''})`:''}`)}return L.join(nl)}
function runIf(st,d,n){const p=d.ifs[n];const L=['interface '+M.nomeLongo(n)];if(p.desc)L.push(' description '+p.desc);
  if(p.mode==='routed'){L.push(' no switchport');L.push(p.ip?` ip address ${p.ip} ${p.mask}`:' no ip address')}
  else if(p.mode==='trunk'){if(p.native!==1)L.push(' switchport trunk native vlan '+p.native);if(p.allowed)L.push(' switchport trunk allowed vlan '+M.vlansTxt(p.allowed));L.push(' switchport mode trunk')}
  else{if(p.vlan!==1)L.push(' switchport access vlan '+p.vlan);L.push(' switchport mode access')}
  if(p.aclIn)L.push(` ip access-group ${p.aclIn} in`);if(p.aclOut)L.push(` ip access-group ${p.aclOut} out`);
  if(p.speed!=='auto')L.push(' speed '+p.speed);if(p.duplex!=='auto')L.push(' duplex '+p.duplex);
  if(p.cg)L.push(` channel-group ${p.cg.n} mode ${p.cg.mode}`);if(p.portfast)L.push(' spanning-tree portfast');if(p.bpdufilter)L.push(' spanning-tree bpdufilter enable');if(p.bpduguard)L.push(' spanning-tree bpduguard enable');
  if(p.shut)L.push(' shutdown');return L}
function runSvi(d,v){const s=d.svis[v];const L=['interface Vlan'+v];L.push(s.ip?` ip address ${s.ip} ${s.mask}`:' no ip address');if(s.aclIn)L.push(` ip access-group ${s.aclIn} in`);if(s.aclOut)L.push(` ip access-group ${s.aclOut} out`);if(s.shut)L.push(' shutdown');return L}
function shRun(st,d,soIf){if(soIf){let L;if(/^Vlan/.test(soIf)){if(!d.svis||!d.svis[+soIf.slice(4)])return null;L=runSvi(d,+soIf.slice(4))}else{if(!d.ifs[soIf])return null;L=runIf(st,d,soIf)}
    return['Building configuration...','',`Current configuration : ${L.join(nl).length+6} bytes`,'!',...L,'end'].join(nl)}
  const L=['Building configuration...','','Current configuration : 6142 bytes','!','version 17.9','service timestamps log datetime msec','hostname '+d.nome,'!'];
  if(d.tipo==='l3')L.push('ip routing','!');
  for(const v in d.dhcp){const p=d.dhcp[v];L.push('ip dhcp pool VLAN'+v,` network ${M.redeDe(p.gw,p.mask)} ${p.mask}`,` default-router ${p.gw}`,` dns-server ${p.dns}`,'!')}
  L.push('spanning-tree mode rapid-pvst');if(d.stpPrio!==32768)L.push('spanning-tree vlan 1-4094 priority '+d.stpPrio);if(d.errRecov)L.push('errdisable recovery cause bpduguard');L.push('!');
  for(const v of Object.keys(d.vlans).map(Number).filter(v=>v!==1).sort((a,b)=>a-b))L.push('vlan '+v,' name '+d.vlans[v],'!');
  for(const n of portasOrd(d))L.push(...runIf(st,d,n),'!');
  if(d.tipo==='l3'){for(const v of Object.keys(d.svis).map(Number).sort((a,b)=>a-b))L.push(...runSvi(d,v),'!');
    for(const r of d.rotas)L.push(`ip route ${r.rede} ${r.mask} ${r.nh}`);L.push('!');
    for(const n of Object.keys(d.acls)){L.push('ip access-list extended '+n);for(const e of[...d.acls[n].regras].sort((a,b)=>a.seq-b.seq))L.push(` ${e.seq} ${fmtAce(e)}`);L.push('!')}}
  L.push('line vty 0 15',' transport input ssh','!','end');return L.join(nl)}
function shIntDet(st,d,n){const p=d.ifs[n];if(!p)return null;const s=st.l2.porta[d.id+'|'+n];const g=negDe(st,d,n);const R2=st.l2;
  let cab;if(s==='disabled')cab=`${M.nomeLongo(n)} is administratively down, line protocol is down (disabled)`;else if(s==='err-disabled')cab=`${M.nomeLongo(n)} is down, line protocol is down (err-disabled)`;else if(s==='notconnect')cab=`${M.nomeLongo(n)} is down, line protocol is down (notconnect)`;else if(s==='suspended')cab=`${M.nomeLongo(n)} is up, line protocol is down (suspended)`;else cab=`${M.nomeLongo(n)} is up, line protocol is up (${s})`;
  const lp=R2.lp.get(d.id+'|'+n);const lk=lp&&R2.link[lp.ix];const storm=lk&&[...lk.fwd].some(v=>R2.stormVlan.has(v));
  const h=(d.id+n).split('').reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7);const up=s==='connected'||s==='inactive';
  let crc=0,runts=0,late=0,col=0;if(lk&&lk.lossy&&g){if(g.dup==='full'){crc=1820+(h%400);runts=640+(h%90)}else{late=2310+(h%300);col=9120+(h%800)}}
  const bc=storm?48211934+(h%9000):1200+(h%800);const rate=storm?'948211000':up?String(1200000+(h%500000)):'0';
  const L=[cab,`  Hardware is ${n.startsWith('Po')?'EtherChannel':'Gigabit Ethernet'}, address is ${d.mac.slice(0,10)}${(M.pid(n)).toString(16).padStart(4,'0')}`];
  if(p.desc)L.push('  Description: '+p.desc);L.push('  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec,');
  if(g)L.push(`  ${g.dup==='full'?'Full':'Half'}-duplex, ${g.spd}Mb/s, media type is 10/100/1000BaseTX`);else L.push(`  ${p.duplex==='auto'?'Auto':p.duplex}-duplex, ${p.speed==='auto'?'Auto':p.speed}-speed, media type is 10/100/1000BaseTX`);
  if(n.startsWith('Po')){const po=R2.po[d.id+'|'+n];L.push(`  Members in this channel: ${po?po.ativos.join(' '):''}`)}
  L.push(`  5 minute input rate ${rate} bits/sec, ${storm?'1482331':up?String(300+(h%200)):'0'} packets/sec`,`  5 minute output rate ${storm?'947100000':up?String(980000+(h%300000)):'0'} bits/sec`,
    `     ${up?8423311+(h%100000):0} packets input, ${up?1023344112+h:0} bytes, 0 no buffer`,`     Received ${up?bc:0} broadcasts (${up?Math.floor(bc*0.7):0} multicasts)`,`     ${runts} runts, 0 giants, 0 throttles`,
    `     ${crc+runts} input errors, ${crc} CRC, ${Math.floor(crc/4)} frame, 0 overrun, 0 ignored`,`     ${up?7998234+(h%90000):0} packets output, ${up?912334222+h:0} bytes, 0 underruns`,`     0 output errors, ${col} collisions, 2 interface resets`,`     ${late} late collision, ${Math.floor(col/10)} deferred`);
  return L.join(nl)}
function shLog(st,d){const L=['Syslog logging: enabled (0 messages dropped, 0 flushes, 0 overruns)','    Console logging: level debugging','    Buffer logging:  level debugging, '+d.logs.length+' messages logged','','Log Buffer (16384 bytes):',''];
  if(!d.logs.length)L.push(`${fmtTs(0)}: %SYS-5-RESTART: System restarted --`);d.logs.forEach(x=>L.push(`${fmtTs(x.t)}: ${x.msg}`));return L.join(nl)}
function shMac(st,d){const R2=st.l2;const L=['          Mac Address Table','-------------------------------------------','','Vlan    Mac Address       Type        Ports','----    -----------       --------    -----'];let tot=0;
  for(const v of Object.keys(d.vlans).map(Number).sort((a,b)=>a-b)){const ini='S:'+d.id+':'+v;if(!R2.adj.has(ini))continue;const vis=new Map([[ini,null]]);const q=[ini];
    while(q.length){const x=q.shift();for(const e of R2.adj.get(x)||[])if(!vis.has(e.to)){vis.set(e.to,vis.get(x)===null?e.gi:vis.get(x));q.push(e.to)}}
    const linhas=[];for(const[no,gi]of vis){if(gi===null)continue;let mac=null;const[k,dev,vv]=no.split(':');
      if(k==='E')mac=st.devs[dev].mac;else if(k==='S'&&dev==='CORE'&&d.id!=='CORE'&&R2.sviUp[vv])mac=sviMac(vv);if(!mac)continue;
      const g=R2.logicas[gi];const pt=g.a.dev===d.id?g.a.p:g.b.p;linhas.push(`${lpad(v,4)}    ${mac}    DYNAMIC     ${pt}`)}
    linhas.sort().forEach(x=>{L.push(x);tot++})}
  L.push(`Total Mac Addresses for this criterion: ${tot}`);return L.join(nl)}
function shCdp(st,d){const L=['Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge','                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone','','Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID'];
  st.links.forEach((l,ix)=>{if(!st.l2.link[ix].up)return;for(const[me,ot]of[[l.a,l.b],[l.b,l.a]]){if(me[0]!==d.id)continue;const od=st.devs[ot[0]];if(!M.ehSw(od)||od.id===d.id)continue;
    L.push(pad(od.nome,17)+pad(curto(me[1]),18)+pad(150+ix%30,11)+pad(od.tipo==='l3'?'R S I':'S I',12)+pad(od.tipo==='l3'?'C9300-24T':'WS-C2960X',10)+curto(ot[1]))}});
  L.push('',`Total cdp entries displayed : ${L.length-4}`);return L.join(nl)}
function shDhcp(st,d){if(d.tipo!=='l3')return null;const L=['Bindings from all pools not associated with VRF:','IP address      Client-ID/              Lease expiration        Type       State      Interface','                Hardware address/','                User name'];
  for(const e of Object.values(st.devs))if(M.ehEp(e)&&e.lease)L.push(pad(e.lease.ip,16)+pad('01'+e.mac.replace(/\./g,'').replace(/(....)/g,'$1.').replace(/\.$/,''),24)+pad('Oct 31 2026 07:02 AM',24)+pad('Automatic',11)+pad('Active',11)+'Vlan'+e.lease.vlan);return L.join(nl)}
function show(st,id,toks,R){const d=st.devs[id];const o=x=>R.linhas.push(['out',x]),nt=x=>R.linhas.push(['note',x]);let c;
  if(c=casar(toks,'running-config interface <if>')){const r=shRun(st,d,c[0]);return r?o(r):R.linhas.push(['bad','% Invalid input detected at \'^\' marker.'])}
  if(casar(toks,'running-config'))return o(shRun(st,d));
  if(casar(toks,'startup-config'))return o(shRun(st,d)),d.naoSalvo&&nt('» Há mudanças NÃO salvas: a startup-config ainda é a antiga. Use write memory.');
  if(casar(toks,'interfaces status')){o(shIntStatus(st,d));const txt=Object.keys(d.ifs).map(n=>st.l2.porta[d.id+'|'+n]);
    if(txt.includes('err-disabled'))nt('» err-disabled = o switch desligou a porta por proteção (BPDU Guard, port-security...). Veja show logging.');
    if(txt.includes('inactive'))nt('» inactive = a porta está numa VLAN que não existe neste switch.');if(txt.includes('disabled'))nt('» disabled = desligada por comando (shutdown).');
    if(txt.includes('suspended'))nt('» suspended = membro de EtherChannel que não conseguiu agregar.');return}
  if(casar(toks,'interfaces trunk')){const r=shTrunk(st,d);return o(r||'')}
  if(c=casar(toks,'interfaces <if> switchport')||casar(toks,'interfaces <if> [counters]')){const r=shIntDet(st,d,c[0]);return r?o(r):R.linhas.push(['bad','% Invalid input detected at \'^\' marker.'])}
  if(casar(toks,'ip interface brief')){if(d.tipo!=='l3')nt('» Switch camada 2: as portas não têm IP.');return o(shIpBrief(st,d))}
  if(casar(toks,'ip route')){if(d.tipo!=='l3')return o('Default gateway is not set\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty'),nt('» Switch camada 2: não roteia. Quem roteia aqui é o CORE-01.');return o(shRoute(st,d))}
  if(casar(toks,'ip dhcp binding')){const r=shDhcp(st,d);return r?o(r):R.linhas.push(['bad','% Este switch não é servidor DHCP.'])}
  if(casar(toks,'vlan [brief]'))return o(shVlan(st,d));
  if(c=casar(toks,'spanning-tree vlan <n>'))return o(shStp(st,d,c[0]));
  if(casar(toks,'spanning-tree [summary]'))return o(shStp(st,d,null)),nt('» Role: Root = caminho até a raiz · Desg = encaminha para o segmento · Altn/Back = reserva (BLK, bloqueada para evitar loop).');
  if(casar(toks,'etherchannel [summary]'))return o(shEther(st,d));
  if(casar(toks,'access-lists')||casar(toks,'ip access-lists')){if(d.tipo!=='l3')return o('');return o(shAcl(st,d))}
  if(casar(toks,'mac address-table [dynamic]'))return o(shMac(st,d));
  if(casar(toks,'cdp neighbors [detail]'))return o(shCdp(st,d));
  if(casar(toks,'logging'))return o(shLog(st,d));
  if(casar(toks,'version'))return o(`Cisco IOS XE Software, Version 17.09.04a\n${d.nome} uptime is 214 days, 6 hours, 12 minutes\ncisco ${d.modelo} processor\nConfiguration register is 0x102`);
  if(casar(toks,'clock'))return o(fmtTs(st.relogio)+' BRT Fri Oct 30 2026');
  R.linhas.push(['bad','% Invalid input detected at \'^\' marker.']);nt('» Comandos show aceitos: digite ? para ver a lista.')}

/* ---------- modo configuração IOS ---------- */
function alvoIf(st,d,n){if(/^Vlan/.test(n)){if(d.tipo!=='l3')return null;const v=+n.slice(4);if(!d.svis[v])d.svis[v]={ip:null,mask:null,shut:false,aclIn:null,aclOut:null};return n}return d.ifs[n]?n:null}
function parseRange(d,txt){const out=[];for(const parte of txt.split(',')){const m=parte.trim().match(/^([a-z-]+)\s*(\d+\/\d+\/)(\d+)\s*(?:-\s*(?:[a-z-]*\s*\d+\/\d+\/)?(\d+))?$/i);if(!m)return null;
  const base=M.normIf(m[1]+m[2]+m[3]);if(!base)return null;const pre=base.slice(0,base.lastIndexOf('/')+1);const a=+m[3],b=m[4]?+m[4]:a;for(let i=a;i<=b;i++){const n=pre+i;if(!d.ifs[n])return null;out.push(n)}}return out}
function parseEnd(toks,i){const t=(toks[i]||'').toLowerCase();if(t==='any')return[{any:true},i+1];if(t==='host'&&M.ehIP(toks[i+1]||''))return[{ip:toks[i+1],wc:'0.0.0.0'},i+2];if(M.ehIP(toks[i]||'')&&M.ehIP(toks[i+1]||''))return[{ip:toks[i],wc:toks[i+1]},i+2];return[null,i]}
const PORTAS_NOMES={www:80,http:80,https:443,domain:53,ssh:22,telnet:23};
function parseAce(toks){let i=0;let seq=null;if(/^\d+$/.test(toks[0])){seq=+toks[0];i=1}const acao=(toks[i]||'').toLowerCase();if(acao!=='permit'&&acao!=='deny')return null;i++;
  const proto=(toks[i]||'').toLowerCase();if(!['ip','tcp','udp','icmp'].includes(proto))return null;i++;
  const[src,i2]=parseEnd(toks,i);if(!src)return null;const[dst,i3]=parseEnd(toks,i2);if(!dst)return null;i=i3;let porta=null;
  if(toks[i]&&toks[i].toLowerCase()==='eq'){if(proto!=='tcp'&&proto!=='udp')return null;const p=toks[i+1]||'';porta=/^\d+$/.test(p)?+p:PORTAS_NOMES[p.toLowerCase()];if(!porta)return null;i+=2}
  if(i<toks.length)return null;return{seq,acao,proto,src,dst,porta}}
function iosConfig(st,id,toks,s,R){const d=st.devs[id],t=T(st,id);let c;const o=x=>R.linhas.push(['out',x]),nt=x=>R.linhas.push(['note',x]),bad=x=>R.linhas.push(['bad',x]);const l3=d.tipo==='l3';
  if(casar(toks,'end')){t.modo='priv';t.ifs=[];return}
  if(casar(toks,'exit')){t.modo=t.modo==='config'?'priv':'config';t.ifs=[];return}
  if(c=casar(toks,'interface range *')){const ps=parseRange(d,c[0]);if(!ps||!ps.length)return bad('% Invalid input detected at \'^\' marker.'),nt('» Exemplo: interface range gi1/0/49 - 50');t.modo='if';t.ifs=ps;return}
  if(c=casar(toks,'interface <if>')){const n=alvoIf(st,d,c[0]);if(!n)return bad(/^Vlan/.test(c[0])?'% Este switch é camada 2 neste laboratório: sem interface VLAN roteada.':'% Invalid input detected at \'^\' marker.'),nt('» Portas existentes: veja show interfaces status.');t.modo='if';t.ifs=[n];return}
  if(c=casar(toks,'no vlan <n>')){if(c[0]===1)return bad('%Default VLAN 1 may not be deleted.');mudar(st,id,R,()=>delete d.vlans[c[0]]);t.modo='config';return}
  if(c=casar(toks,'vlan <n>')){if(c[0]<1||c[0]>4094)return bad('% Invalid input detected at \'^\' marker.');mudar(st,id,R,()=>{if(d.vlans[c[0]]===undefined)d.vlans[c[0]]='VLAN'+String(c[0]).padStart(4,'0')});t.modo='vlan';t.vlan=c[0];return}
  if(l3&&(c=casar(toks,'ip route <ip> <ip> <ip>'))){if(!M.mascaraOk(c[1]))return bad('%Inconsistent address and mask');if(d.rotas.some(r=>r.rede===c[0]&&r.mask===c[1]&&r.nh===c[2]))return;mudar(st,id,R,()=>d.rotas.push({rede:c[0],mask:c[1],nh:c[2]}));t.modo='config';return}
  if(l3&&(c=casar(toks,'no ip route <ip> <ip> [<ip>]')||casar(toks,'no ip route <ip> <ip>'))){mudar(st,id,R,()=>{d.rotas=d.rotas.filter(r=>!(r.rede===c[0]&&r.mask===c[1]&&(!c[2]||r.nh===c[2])))});t.modo='config';return}
  if(l3&&(c=casar(toks,'ip access-list extended <w>'))){if(!d.acls[c[0]])d.acls[c[0]]={regras:[]};t.modo='acl';t.acl=c[0];return}
  if(l3&&(c=casar(toks,'no ip access-list extended <w>'))){mudar(st,id,R,()=>delete d.acls[c[0]]);t.modo='config';return}
  if(c=casar(toks,'spanning-tree vlan <w> priority <n>')){if(c[1]%4096)return bad('% Bridge Priority must be in increments of 4096.\n% Allowed values are:\n  0     4096  8192  12288 16384 20480 24576 28672\n  32768 36864 40960 45056 49152 53248 57344 61440');mudar(st,id,R,()=>d.stpPrio=c[1]);t.modo='config';return}
  if(casar(toks,'spanning-tree mode *'))return;
  if(casar(toks,'no spanning-tree vlan *'))return bad('% Desligar o STP não é suportado neste simulador (e quase nunca é boa ideia em produção).');
  if(casar(toks,'errdisable recovery cause *')){d.errRecov=true;d.naoSalvo=true;return nt('» Recuperação automática configurada (300 s). Ela religa a porta sozinha; se a causa continuar, a porta cai de novo.')}
  if(casar(toks,'hostname *'))return bad('% No simulador o hostname é fixo (o mapa depende dele).');
  if(t.modo==='vlan'){if(c=casar(toks,'name <w>')){d.vlans[t.vlan]=c[0].toUpperCase().slice(0,32);d.naoSalvo=true;return}return invalido(R)}
  if(t.modo==='acl')return aclCfg(st,id,toks,R);
  if(t.modo==='if')return ifCfg(st,id,toks,R);
  invalido(R)}
function aclCfg(st,id,toks,R){const d=st.devs[id],t=T(st,id);const a=d.acls[t.acl];let c;const bad=x=>R.linhas.push(['bad',x]),nt=x=>R.linhas.push(['note',x]);
  if(c=casar(toks,'no <n>')){if(!a.regras.some(e=>e.seq===c[0]))return;mudar(st,id,R,()=>a.regras=a.regras.filter(e=>e.seq!==c[0]));return}
  if(c=casar(toks,'remark *')){a.regras.push({seq:(Math.max(0,...a.regras.map(e=>e.seq))+10),remark:c[0]});return}
  const e=parseAce(toks);if(!e)return bad('% Invalid input detected at \'^\' marker.'),nt('» Formato: [seq] permit|deny ip|tcp|udp|icmp <origem> <destino> [eq porta]. Origem/destino: any, host 10.10.1.20 ou 10.10.30.0 0.0.0.255');
  if(e.seq==null)e.seq=Math.max(0,...a.regras.map(x=>x.seq))+10;if(a.regras.some(x=>x.seq===e.seq))return bad('% Duplicate sequence number');
  for(const x of[e.src,e.dst])if(!x.any&&x.wc!=='0.0.0.0'){const ip=M.ip2n(x.ip),w=M.ip2n(x.wc);if((ip&w)>>>0)nt(`» Atenção: ${x.ip} ${x.wc}: o IOS guarda como ${M.n2ip((ip&~w)>>>0)} ${x.wc}.`),x.ip=M.n2ip((ip&~w)>>>0)}
  mudar(st,id,R,()=>a.regras.push(e))}
function ifCfg(st,id,toks,R){const d=st.devs[id],t=T(st,id);let c;const o=x=>R.linhas.push(['out',x]),bad=x=>R.linhas.push(['bad',x]),nt=x=>R.linhas.push(['note',x]);
  const svis=t.ifs.filter(n=>/^Vlan/.test(n)),fis=t.ifs.filter(n=>!/^Vlan/.test(n));const cfgSvi=n=>d.svis[+n.slice(4)];
  const membros=n=>n.startsWith('Po')?Object.keys(d.ifs).filter(x=>!x.startsWith('Po')&&d.ifs[x].cg&&d.ifs[x].cg.n===+n.slice(2)):[];
  const cadaL2=fn=>{if(svis.length)return bad('% Comando de porta de switch: não vale para interface VLAN.');const rot=fis.filter(n=>d.ifs[n].mode==='routed');if(rot.length)return bad(`% ${rot[0]} está em modo camada 3 (no switchport). Use "switchport" antes.`);mudar(st,id,R,()=>fis.forEach(n=>{fn(d.ifs[n],n);membros(n).forEach(m=>fn(d.ifs[m],m))}))};
  if(casar(toks,'shutdown'))return mudar(st,id,R,()=>{svis.forEach(n=>cfgSvi(n).shut=true);fis.forEach(n=>{d.ifs[n].shut=true;d.ifs[n].errdis=null})});
  if(casar(toks,'no shutdown'))return mudar(st,id,R,()=>{svis.forEach(n=>cfgSvi(n).shut=false);fis.forEach(n=>{d.ifs[n].shut=false})});
  if(c=casar(toks,'description *')){t.ifs.forEach(n=>{if(/^Vlan/.test(n))return;d.ifs[n].desc=c[0]});d.naoSalvo=true;return}
  if(casar(toks,'no description')){fis.forEach(n=>d.ifs[n].desc='');return}
  if(c=casar(toks,'switchport mode access|trunk'))return cadaL2(p=>p.mode=c[0]);
  if(c=casar(toks,'switchport access vlan <n>')){if(c[0]<1||c[0]>4094)return bad('% Invalid input detected at \'^\' marker.');if(d.vlans[c[0]]===undefined){o(`% Access VLAN does not exist. Creating vlan ${c[0]}`);d.vlans[c[0]]='VLAN'+String(c[0]).padStart(4,'0')}return cadaL2(p=>p.vlan=c[0])}
  if(casar(toks,'no switchport access vlan'))return cadaL2(p=>p.vlan=1);
  if(c=casar(toks,'switchport trunk allowed vlan add|remove|except <w>')){const l=M.listaVlans(c[1]);if(!l)return bad('% Invalid input detected at \'^\' marker.');
    return cadaL2(p=>{const at=p.allowed?p.allowed.slice():M.listaVlans('1-4094');let novo;if(c[0]==='add')novo=[...new Set(at.concat(l))];else if(c[0]==='remove')novo=at.filter(v=>!l.includes(v));else novo=M.listaVlans('1-4094').filter(v=>!l.includes(v));novo.sort((a,b)=>a-b);p.allowed=novo.length===4094?null:novo})}
  if(casar(toks,'switchport trunk allowed vlan all'))return cadaL2(p=>p.allowed=null);
  if(casar(toks,'switchport trunk allowed vlan none'))return cadaL2(p=>p.allowed=[]);
  if(c=casar(toks,'switchport trunk allowed vlan <w>')){const l=M.listaVlans(c[0]);if(!l)return bad('% Invalid input detected at \'^\' marker.');const r=cadaL2(p=>p.allowed=l);nt('» Atenção: sem "add", essa lista SUBSTITUI a anterior. Confira com show interfaces trunk.');return r}
  if(casar(toks,'no switchport trunk allowed vlan'))return cadaL2(p=>p.allowed=null);
  if(c=casar(toks,'switchport trunk native vlan <n>'))return cadaL2(p=>p.native=c[0]);
  if(casar(toks,'no switchport trunk native vlan'))return cadaL2(p=>p.native=1);
  if(casar(toks,'switchport trunk encapsulation dot1q')||casar(toks,'switchport nonegotiate'))return;
  if(casar(toks,'no switchport')){if(d.tipo!=='l3')return bad('% Switch camada 2: portas não podem virar portas roteadas.');if(svis.length||fis.some(n=>n.startsWith('Po')))return invalido(R);return mudar(st,id,R,()=>fis.forEach(n=>{d.ifs[n].mode='routed'}))}
  if(casar(toks,'switchport'))return mudar(st,id,R,()=>fis.forEach(n=>{if(d.ifs[n].mode==='routed'){d.ifs[n].mode='access';d.ifs[n].ip=null;d.ifs[n].mask=null}}));
  if(c=casar(toks,'channel-group <n> mode active|passive|on')){if(svis.length||fis.some(n=>n.startsWith('Po')))return invalido(R);const po='Po'+c[0];
    return mudar(st,id,R,()=>{if(!d.ifs[po]){const b=d.ifs[fis[0]];d.ifs[po]=M.porta({mode:b.mode,vlan:b.vlan,allowed:b.allowed?b.allowed.slice():null,native:b.native});o(`Creating a port-channel interface Port-channel ${c[0]}`)}
      fis.forEach(n=>{const p=d.ifs[n],P=d.ifs[po];p.cg={n:c[0],mode:c[1]};p.mode=P.mode;p.allowed=P.allowed?P.allowed.slice():null;p.native=P.native;p.vlan=P.vlan})})}
  if(casar(toks,'no channel-group'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].cg=null));
  if(c=casar(toks,'speed auto|10|100|1000'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].speed=c[0]));
  if(casar(toks,'no speed'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].speed='auto'));
  if(c=casar(toks,'duplex auto|full|half'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].duplex=c[0]));
  if(casar(toks,'no duplex'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].duplex='auto'));
  if(c=casar(toks,'ip address <ip> <ip>')){if(!M.mascaraOk(c[1]))return bad('% Bad mask '+c[1]);if(fis.some(n=>d.ifs[n].mode!=='routed'))return bad('% Porta de switch (camada 2): use "no switchport" antes, ou configure o IP na interface VLAN.');
    return mudar(st,id,R,()=>{svis.forEach(n=>{cfgSvi(n).ip=c[0];cfgSvi(n).mask=c[1]});fis.forEach(n=>{d.ifs[n].ip=c[0];d.ifs[n].mask=c[1]})})}
  if(casar(toks,'no ip address'))return mudar(st,id,R,()=>{svis.forEach(n=>{cfgSvi(n).ip=null});fis.forEach(n=>{d.ifs[n].ip=null})});
  if(c=casar(toks,'ip access-group <w> in|out')){const k=c[1]==='in'?'aclIn':'aclOut';return mudar(st,id,R,()=>{svis.forEach(n=>cfgSvi(n)[k]=c[0]);fis.forEach(n=>d.ifs[n][k]=c[0])})}
  if(c=casar(toks,'no ip access-group <w> in|out')||casar(toks,'no ip access-group <w>')){const k=c[1]==='out'?'aclOut':'aclIn';return mudar(st,id,R,()=>{svis.forEach(n=>cfgSvi(n)[k]=null);fis.forEach(n=>d.ifs[n][k]=null)})}
  if(casar(toks,'spanning-tree portfast [edge]'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].portfast=true));
  if(casar(toks,'no spanning-tree portfast'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].portfast=false));
  if(casar(toks,'spanning-tree bpduguard enable'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].bpduguard=true));
  if(casar(toks,'spanning-tree bpduguard disable')||casar(toks,'no spanning-tree bpduguard [enable]'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].bpduguard=false));
  if(casar(toks,'spanning-tree bpdufilter enable'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].bpdufilter=true));
  if(casar(toks,'spanning-tree bpdufilter disable')||casar(toks,'no spanning-tree bpdufilter [enable]'))return mudar(st,id,R,()=>fis.forEach(n=>d.ifs[n].bpdufilter=false));
  invalido(R)}

/* ================= FortiOS ================= */
const TABS={'firewall policy':'politicas','router static':'rotas','system interface':'ifs'};
function fosPolicy(p,full){const L=['    edit '+p.id];const s=(k,v)=>L.push(`        set ${k} ${v}`);
  if(p.nome)s('name','"'+p.nome+'"');s('uuid','5c1e4a2e-7d3b-51ee-8f4a-0c0de'+String(p.id).padStart(7,'0'));if(full||!p.status)s('status',p.status?'enable':'disable');
  if(p.src)s('srcintf','"'+p.src+'"');if(p.dst)s('dstintf','"'+p.dst+'"');if(full||p.action!=='deny')s('action',p.action);
  if(p.srcaddr)s('srcaddr','"'+p.srcaddr+'"');if(p.dstaddr)s('dstaddr','"'+p.dstaddr+'"');s('schedule','"'+(p.schedule||'always')+'"');if(p.service)s('service','"'+p.service+'"');
  if(full)s('logtraffic','utm');if(full||p.nat)s('nat',p.nat?'enable':'disable');L.push('    next');return L}
function fosStatic(r,full){const L=['    edit '+r.id];const s=(k,v)=>L.push(`        set ${k} ${v}`);if(full||!r.status)s('status',r.status?'enable':'disable');
  if(full||r.dst!=='0.0.0.0'||r.mask!=='0.0.0.0')s('dst',`${r.dst} ${r.mask}`);if(r.gw)s('gateway',r.gw);if(full)s('distance',10);if(r.dev)s('device','"'+r.dev+'"');L.push('    next');return L}
function fosIf(n,i,full){return['    edit "'+n+'"','        set vdom "root"',`        set ip ${i.ip} ${i.mask}`,`        set allowaccess ${i.allow}`,...(full||i.status!=='up'?[`        set status ${i.status}`]:[]),'        set type physical',`        set alias "${i.alias}"`,'    next']}
function fosShow(d,tab,full,chave){const L=['config '+tab];
  if(tab==='firewall policy')d.politicas.filter(p=>chave==null||String(p.id)===String(chave)).forEach(p=>L.push(...fosPolicy(p,full)));
  else if(tab==='router static')d.rotas.filter(r=>chave==null||String(r.id)===String(chave)).forEach(r=>L.push(...fosStatic(r,full)));
  else Object.entries(d.ifs).filter(([n])=>chave==null||n===chave).forEach(([n,i])=>L.push(...fosIf(n,i,full)));L.push('end');return L.join(nl)}
function fosRotas(st){const rs=M.rotas(st,'FGT').slice().sort((a,b)=>M.ip2n(a.rede)-M.ip2n(b.rede)||a.len-b.len);
  const L=['Codes: K - kernel, C - connected, S - static, R - RIP, B - BGP','       O - OSPF, IA - OSPF inter area','       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2','       E1 - OSPF external type 1, E2 - OSPF external type 2','       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area','       V - BGP VPNv4','       * - candidate default','','Routing table for VRF=0'];
  rs.forEach(r=>L.push(r.t==='C'?pad('C',8)+`${r.rede}/${r.len} is directly connected, ${r.ifn}`:pad(r.len===0?'S*':'S',8)+`${r.rede}/${r.len} [10/0] via ${r.nh}, ${r.ifn}, [1/0]`));return L.join(nl)}
function sniffer(st,ifn,filtro,verb,cnt){const toks=(filtro||'none').toLowerCase().replace(/['"]/g,'').split(/\s+/).filter(x=>x&&x!=='and');
  const conds=[];for(let i=0;i<toks.length;i++){const t=toks[i];if(t==='none')continue;if(['icmp','tcp','udp'].includes(t))conds.push(e=>e.proto===t);else if(t==='host'){const h=toks[++i];conds.push(e=>e.src===h||e.dst===h)}else if(t==='port'){const p=+toks[++i];conds.push(e=>e.porta===p)}else if(t==='src'&&toks[i+1]==='host'){const h=toks[i+2];i+=2;conds.push(e=>e.src===h)}else if(t==='dst'&&toks[i+1]==='host'){const h=toks[i+2];i+=2;conds.push(e=>e.dst===h)}}
  let es=st.sniff.filter(e=>(ifn==='any'||e.ifn===ifn)&&conds.every(f=>f(e)));if(cnt)es=es.slice(-cnt);
  const L=[`interfaces=[${ifn}]`,`filters=[${filtro||'none'}]`];
  es.forEach((e,i)=>{const tm=(e.t%100+i*0.000731).toFixed(6);let desc;if(e.proto==='icmp')desc=`icmp: echo ${e.rep?'reply':'request'}`;else if(e.proto==='udp')desc=`udp 32`;else desc=e.rep?'syn-ack 2930071':'syn 1840332';
    const sp=e.proto==='icmp'?'':e.rep?'.'+(e.porta||53):'.51'+(400+i);const dp=e.proto==='icmp'?'':e.rep?'.51'+(400+i):'.'+e.porta;
    L.push(`${tm} ${verb>=4?e.ifn+' '+e.dir+' ':''}${e.src}${sp} -> ${e.dst}${dp}: ${desc}`)});
  L.push('',`${es.length} packets received by filter`,'0 packets dropped by kernel');return L.join(nl)}
const FUNC=m=>m.startsWith('vd-root')?['print_pkt_detail',5895]:m.startsWith('find a route')?['vf_ip_route_input_common',2605]:m.startsWith('reverse path')?['ip_route_input_slow',1450]:m.startsWith('SNAT')?['__ip_session_run_tuple',3557]:m.startsWith('resposta')?['resolve_ip_tuple_fast',5826]:['fw_forward_handler',881];
function fos(st,id,s,R){const d=st.devs[id],t=T(st,id);const o=x=>R.linhas.push(['out',x]),nt=x=>R.linhas.push(['note',x]),bad=x=>R.linhas.push(['bad',x]);const low=s.toLowerCase();let m;
  const topo=t.fos[t.fos.length-1];
  if(/^(\?|ajuda|help)$/.test(low))return o(['Comandos do FortiGate (FortiOS):','  get router info routing-table all     get system interface physical','  show firewall policy [id]   |  show full-configuration firewall policy','  show router static          |  show system interface',
    '  execute ping <ip>           |  execute traceroute <ip>',"  diagnose sniffer packet <any|port1|port2> '<filtro>' <1|4> [qtd]     ex.: diagnose sniffer packet any 'icmp' 4",'  diagnose debug flow trace start 10   (mostra o rastreio dos últimos fluxos)',
    '  config firewall policy | config router static | config system interface','     dentro: edit <id>, set <campo> <valor>, unset <campo>, next, end, abort, show, delete <id>'].join(nl));
  if(low==='cls'||low==='clear'){R.limpar=true;return}
  if(m=low.match(/^show\s+(full-configuration\s+)?(firewall policy|router static|system interface)(?:\s+"?([^"]+)"?)?$/))return o(fosShow(d,m[2],!!m[1],m[3]));
  if(!topo){
    if(/^get\s+router\s+info\s+routing-table(\s+all|\s+details)?$/.test(low)){o(fosRotas(st));if(!st.devs.FGT.rotas.some(r=>r.id===2))nt('» Repare: nada aqui cobre as VLANs internas 10.10.10.0, 10.10.20.0, 10.10.30.0... Só o /30 do link com o core.');return}
    if(/^get\s+system\s+interface(\s+physical)?$/.test(low))return o(['== [onboard]',...Object.entries(d.ifs).flatMap(([n,i])=>[`        ==[${n}]`,'                mode: static',`                ip: ${i.ip} ${i.mask}`,`                status: ${i.status==='up'&&M.ifUp(st,'FGT',n)?'up':'down'}`,'                speed: 1000Mbps (Duplex: full)'])].join(nl));
    if(/^get\s+system\s+status$/.test(low))return o('Version: FortiGate-100F v7.4.4,build2662,240514 (GA.F)\nHostname: FGT-HVC\nOperation Mode: NAT\nCurrent virtual domain: root');
    if(m=low.match(/^exec(?:ute)?\s+ping\s+(\S+)$/)){const r=M.ping(st,id,m[1],{registrar:true});R.anim={trilha:r.trilha||[id],ok:r.tipo==='ok'};
      if(r.tipo==='nome')return o(`Unable to resolve hostname.`);const ip=r.ip||m[1];const L=[`PING ${ip} (${ip}): 56 data bytes`];let rec=0;
      if(r.tipo==='ok')for(let i=0;i<5;i++){if(r.lossy&&i%2)continue;rec++;L.push(`64 bytes from ${ip}: icmp_seq=${i} ttl=${r.ttl} time=${(r.ms+0.3*i).toFixed(1)} ms`)}
      L.push('',`--- ${ip} ping statistics ---`,`5 packets transmitted, ${rec} packets received, ${100-rec*20}% packet loss`);if(rec)L.push(`round-trip min/avg/max = ${r.ms}.1/${r.ms}.4/${r.ms+1}.0 ms`);o(L.join(nl));
      if(r.tipo!=='ok'&&M.privado(ip)&&!st.devs.FGT.rotas.some(x=>x.id===2))nt('» Sem rota para a rede interna, o FortiGate manda esse pacote pela rota padrão (WAN).');return}
    if(m=low.match(/^exec(?:ute)?\s+traceroute\s+(\S+)$/)){const r=M.traceroute(st,id,m[1],{registrar:true});R.anim={trilha:r.trilha||[id],ok:!!r.okFinal};const L=[`traceroute to ${r.ip||m[1]} (${r.ip||m[1]}), 32 hops max, 3 probe packets per hop, 84 byte packets`];
      (r.linhas||[]).forEach((h,i)=>L.push(h?` ${i+1}  ${h.ip}  ${i+2}.1 ms  ${i+2}.0 ms  ${i+2}.3 ms`:` ${i+1}  * * *`));return o(L.join(nl))}
    if(m=s.match(/^diag(?:nose)?\s+sniffer\s+packet\s+(\S+)(?:\s+(['"])(.*?)\2|\s+(none))?(?:\s+(\d))?(?:\s+(\d+))?/i)){const ifn=m[1].toLowerCase();if(!['any','port1','port2'].includes(ifn))return o('Interface '+m[1]+' not found.');
      o(sniffer(st,ifn,m[3]||m[4]||'none',+(m[5]||1),+(m[6]||0)));nt('» No equipamento real a captura é ao vivo. Aqui ela mostra os últimos pacotes que passaram pelo FortiGate: rode um ping em outro equipamento e capture de novo.');return}
    if(/^diag(?:nose)?\s+debug\s+(enable|disable|reset|flow\s+filter.*|flow\s+show.*|console\s+timestamp.*)$/i.test(s))return;
    if(/^diag(?:nose)?\s+debug\s+flow\s+trace\s+start(\s+\d+)?$/i.test(s)){if(!st.fluxos.length)return o(''),nt('» Nenhum fluxo recente passou pelo FortiGate. Rode um ping a partir de um PC e execute este comando de novo.');
      const L=[];st.fluxos.slice(-6).forEach(f=>f.linhas.forEach(x=>{const[fn,ln]=FUNC(x);L.push(`id=20085 trace_id=${f.id} func=${fn} line=${ln} msg="${x}"`)}));o(L.join(nl));nt('» Leia cada trace_id de cima para baixo: entrada → rota → política/NAT. A última linha diz o que aconteceu com o pacote.');return}
    if(m=low.match(/^config\s+(firewall policy|router static|system interface)$/)){t.fos.push({tab:m[1],chave:null,tmp:null});return}
    if(/^(end|exit)$/.test(low))return;
    if(/^(show|enable|conf|interface|ipconfig|ping)/.test(low))nt('» Comando de outro sistema. No FortiGate: execute ping, get router info routing-table all, show firewall policy...');
    return o('Unknown action 0\nCommand fail. Return code -1')}
  const arr=TABS[topo.tab];
  if(topo.chave==null){
    if(m=s.match(/^edit\s+"?([^"]+)"?$/i)){let k=m[1];const ex=arr==='ifs'?d.ifs[k]:d[arr].find(x=>String(x.id)===k);
      if(arr==='ifs'&&!ex)return o('Entry not found in datasource');if(arr!=='ifs'&&!/^\d+$/.test(k))return o('Invalid id');
      if(!ex)o(`new entry '${k}' added`);const base=ex?JSON.parse(JSON.stringify(ex)):arr==='politicas'?{id:+k,nome:'',src:null,dst:null,srcaddr:null,dstaddr:null,action:'deny',nat:false,status:true,service:null,schedule:'always'}:{id:+k,dst:'0.0.0.0',mask:'0.0.0.0',gw:null,dev:null,status:true};
      topo.chave=k;topo.tmp=base;return}
    if(m=low.match(/^delete\s+"?([^"]+)"?$/)){if(arr==='ifs')return o('Cannot delete a physical interface.');mudar(st,id,R,()=>{d[arr]=d[arr].filter(x=>String(x.id)!==m[1])});return}
    if(low==='show'||low==='show full-configuration')return o(fosShow(d,topo.tab,low!=='show'));
    if(/^(end|abort)$/.test(low)){t.fos.pop();return}
    return o('command parse error before \''+s.split(' ')[0]+'\'\nCommand fail. Return code -61')}
  const x=topo.tmp;
  const commit=()=>{if(arr==='politicas'){for(const[k,a]of[['src','srcintf'],['dst','dstintf'],['srcaddr','srcaddr'],['dstaddr','dstaddr'],['service','service']])if(!x[k]){o(`Attribute '${a}' MUST be set.`);o('Command fail. Return code -56');return false}}
    if(arr==='rotas'&&!x.dev){o("Attribute 'device' MUST be set.");o('Command fail. Return code -56');return false}
    mudar(st,id,R,()=>{if(arr==='ifs')d.ifs[topo.chave]=x;else{const i=d[arr].findIndex(y=>String(y.id)===String(x.id));if(i>=0)d[arr][i]=x;else d[arr].push(x);d[arr].sort((a,b)=>a.id-b.id)}});return true};
  if(low==='next'){if(commit()){topo.chave=null;topo.tmp=null}return}
  if(low==='end'){if(commit())t.fos.pop();return}
  if(low==='abort'){topo.chave=null;topo.tmp=null;return}
  if(low==='show'||low==='show full-configuration'){const L=arr==='politicas'?fosPolicy(x,low!=='show'):arr==='rotas'?fosStatic(x,low!=='show'):fosIf(topo.chave,x,low!=='show');return o(['config '+topo.tab,...L,'end'].join(nl))}
  if(m=s.match(/^unset\s+(\S+)$/i)){const k=m[1].toLowerCase();const mp={policy:{nat:['nat',false],status:['status',true],action:['action','deny']},rot:{gateway:['gw',null],device:['dev',null],dst:['dst','0.0.0.0']}}[arr==='politicas'?'policy':'rot']||{};if(mp[k]){x[mp[k][0]]=mp[k][1];if(k==='dst')x.mask='0.0.0.0'}return}
  if(m=s.match(/^set\s+(\S+)\s+(.+)$/i)){const k=m[1].toLowerCase();const v=m[2].replace(/"/g,'').trim();const vl=v.toLowerCase();const err=()=>o(`value parse error before '${v}'\nCommand fail. Return code -651`);
    if(arr==='politicas'){
      if(k==='status'){if(!/^(enable|disable)$/.test(vl))return err();x.status=vl==='enable';return}
      if(k==='nat'){if(!/^(enable|disable)$/.test(vl))return err();x.nat=vl==='enable';return}
      if(k==='action'){if(!/^(accept|deny)$/.test(vl))return err();x.action=vl;return}
      if(k==='srcintf'||k==='dstintf'){if(!d.ifs[v])return o(`entry not found in datasource\nvalue parse error before '${v}'\nCommand fail. Return code -3`);x[k==='srcintf'?'src':'dst']=v;return}
      if(k==='srcaddr'||k==='dstaddr'){if(vl!=='all')return o(`entry not found in datasource\nvalue parse error before '${v}'`),nt('» Neste laboratório só existe o objeto de endereço "all".');x[k]='all';return}
      if(k==='service'){x.service=v.toUpperCase()==='ALL'?'ALL':v;return}if(k==='name'){x.nome=v;return}if(k==='schedule'){x.schedule=v;return}if(k==='logtraffic')return;
    }else if(arr==='rotas'){
      if(k==='dst'){const p=v.split(/\s+/);let ip=p[0],mk=p[1];if(!mk&&ip.includes('/')){const[a,l]=ip.split('/');ip=a;mk=M.maskDe(+l)}if(!M.ehIP(ip)||!M.mascaraOk(mk||''))return err();x.dst=M.redeDe(ip,mk);x.mask=mk;return}
      if(k==='gateway'){if(!M.ehIP(v))return err();x.gw=v;return}if(k==='device'){if(!d.ifs[v])return o('entry not found in datasource');x.dev=v;return}
      if(k==='status'){x.status=vl==='enable';return}if(k==='distance'||k==='comment')return;
    }else{
      if(k==='status'){if(!/^(up|down)$/.test(vl))return err();x.status=vl;return}if(k==='allowaccess'){x.allow=vl;return}if(k==='alias'){x.alias=v;return}
      if(k==='ip'){const p=v.split(/\s+/);if(!M.ehIP(p[0])||!M.mascaraOk(p[1]||''))return err();x.ip=p[0];x.mask=p[1];return}}
    return o(`command parse error before '${m[1]}'\nCommand fail. Return code -61`)}
  o('command parse error before \''+s.split(' ')[0]+'\'\nCommand fail. Return code -61')}

const CLI={executar,prompt,atalhos,fmtTs,T};
if(typeof module!=='undefined'&&module.exports)module.exports=CLI;else raiz.CLI=CLI;
})(typeof window!=='undefined'?window:globalThis);
