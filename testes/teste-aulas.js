/* Executa cada aula do Trainee digitando os comandos e confere que todo passo é concluído. */
const M=require('../motor.js'),CLI=require('../cli.js'),{AULAS}=require('../aulas.js');
const ROTEIRO={
 'a-ip':[[['RECEP','ipconfig']],[['FAT','ipconfig']],[['PACS','ipconfig']]],
 'a-ping':[[['RECEP','ping 10.10.1.20']],[['RECEP','ping 10.10.1.99']],[['RECEP','ping 8.8.8.8']]],
 'a-gw':[[['RECEP','ipconfig']],[['RECEP','tracert 10.10.1.20']],[['RECEP','netsh interface ip set address "Ethernet" static 10.10.20.87 255.255.255.0 10.10.20.254']],[['RECEP','ping 10.10.20.1'],['RECEP','ping 10.10.1.20']],[['RECEP','netsh interface ip set address "Ethernet" dhcp'],['RECEP','ping 10.10.1.20']]],
 'a-dns':[[['RECEP','nslookup pacs.hvc.local']],[['RECEP','ping pacs.hvc.local']],[['RECEP','netsh interface ip set dns "Ethernet" static 10.10.1.99'],['RECEP','ping pacs.hvc.local']],[['RECEP','netsh interface ip set dns "Ethernet" dhcp'],['RECEP','ping pacs.hvc.local']]],
 'a-sw':[[['SW1A','enable']],[['SW1A','show interfaces status']],[['SW1A','configure terminal'],['SW1A','interface gi1/0/5'],['SW1A','shutdown']],[['SW1A','no shutdown']],[['SW1A','end'],['SW1A','write memory']]],
 'a-vlan':[[['SW1A','enable'],['SW1A','show vlan brief']],[['SW1A','configure terminal'],['SW1A','interface gi1/0/5'],['SW1A','switchport access vlan 99']],[['RECEP','ipconfig /release'],['RECEP','ipconfig /renew']],[['SW1A','interface gi1/0/5'],['SW1A','switchport access vlan 20'],['RECEP','ipconfig']]],
 'a-trunk':[[['SW3A','enable'],['SW3A','show interfaces trunk']],[['SW3A','show cdp neighbors']]],
 'a-core':[[['CORE','enable'],['CORE','show ip interface brief']],[['CORE','show ip route']],[['CORE','ping 8.8.8.8']]],
 'a-fw':[[['RECEP','tracert 8.8.8.8']],[['FGT','show firewall policy']],[['RECEP','ping 8.8.8.8'],['FGT',"diagnose sniffer packet any 'icmp' 4"]]]};
let f=0;
for(const a of AULAS){const st=M.criarRede();const passos=a.passos.filter(p=>p.ok);const rot=ROTEIRO[a.id];
  if(!rot||rot.length!==passos.length){console.log('✗ roteiro',a.id);f++;continue}
  passos.forEach((p,i)=>{let ok=false;for(const[dev,c]of rot[i]){const R=CLI.executar(st,dev,c);if(R.linhas.some(l=>l[0]==='bad'))console.log('  aviso',a.id,c,R.linhas.filter(l=>l[0]==='bad'));if(p.ok({dev,cmd:c.trim().toLowerCase(),R,st}))ok=true}
    if(!ok){console.log(`✗ ${a.id} passo ${i+1} não concluiu`);f++}});
  if(!['a-gw','a-dns','a-sw','a-vlan'].includes(a.id)||M.validar(st,{defeitos:[]}).length===0);else{console.log('✗ rede ficou quebrada',a.id,M.validar(st,{defeitos:[]}));f++}}
console.log(f?f+' falha(s)':'Aulas ok.');process.exit(f?1:0);
