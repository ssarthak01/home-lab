#!/usr/bin/env bash
set -e

ssh pi@10.0.0.161 '
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  cd ~/home-lab &&
  git pull --ff-only &&
  npm install &&
  npm run build &&
  pm2 restart home-lab-dashboard &&
  DISPLAY=:0 xdotool key Ctrl+r
'