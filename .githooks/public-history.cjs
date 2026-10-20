const fs=require('node:fs'),cp=require('node:child_process');
const input=fs.readFileSync(0,'utf8');
for(const line of input.trim().split(/\r?\n/)){
 const [,sha]=line.split(/\s+/);if(!sha||/^0+$/.test(sha))continue;
 const r=cp.spawnSync('git',['rev-list','--max-parents=0',sha],{encoding:'utf8',windowsHide:true});
 if(r.status!==0||r.stdout.trim()!=='20f1cfe6711fc3572fc1c962e9d81d3cdc08e94d'){console.error('STOP: private or mixed Git ancestry cannot enter royal-home-website-public. Port a reviewed diff onto public origin/main.');process.exit(1);}
}
