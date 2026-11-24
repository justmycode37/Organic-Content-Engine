"""Install the independent on-demand producer alongside the existing Mac worker."""
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path
from PIL import Image
import numpy

src=Path(__file__).resolve().parent
support=Path.home()/'Library/Application Support/Organic Content Engine'
dest=support/'silicon-footnote'
credentials=support/'account-worker/account-worker.env'
if not credentials.exists():
    sys.exit('Install the account-worker environment first.')
for name in ('node','ffmpeg','ffprobe','codex','curl'):
    if not shutil.which(name):
        sys.exit('Missing '+name)
(dest/'scripts').mkdir(parents=True,exist_ok=True)
shutil.copytree(src,dest/'scripts/silicon-footnote',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))
for name in ('reel-subscription.mjs','render-worker.mjs'):
    shutil.copy2(src.parent/name,dest/'scripts'/name)
modules=dest/'node_modules'
if not modules.exists():
    modules.symlink_to(support/'account-worker/node_modules',target_is_directory=True)
label='com.organiccontentengine.silicon-footnote'
plist=Path.home()/'Library/LaunchAgents'/(label+'.plist')
plist.parent.mkdir(exist_ok=True)
log=str(dest/'production.log')
plist.write_bytes(plistlib.dumps(dict(Label=label,RunAtLoad=True,KeepAlive=True,ThrottleInterval=45,
    WorkingDirectory=str(dest),StandardOutPath=log,StandardErrorPath=log,
    EnvironmentVariables={'PATH':os.pathsep.join([str(Path(sys.executable).parent),os.environ['PATH']])},
    ProgramArguments=[shutil.which('node'),'--env-file='+str(credentials),str(dest/'scripts/silicon-footnote/worker.mjs')])))
domain='gui/'+str(os.getuid())
subprocess.run(['launchctl','bootout',domain+'/'+label],capture_output=True)
subprocess.run(['launchctl','bootstrap',domain,plist],check=True)
print('Installed Silicon Footnote worker.')
