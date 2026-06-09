const fs = require('fs')

global.owner = "234" //owner number
global.footer = "RANGER XMD TECH" //footer section
global.status = false //"self/public" section of the bot
global.prefa = ['','!','.',',','🐤','🗿']
global.owner = ['62']
global.xprefix = '.'
global.gambar = "https://cdn.tmp.malvryx.dev/files/mxv_39ySA4EXu.jpeg"
global.OWNER_NAME = "PRINCE" //
global.DEVELOPER = ["2349024437359"] //
global.BOT_NAME = "RANGER XMD TECH"
global.bankowner = "𝕫𝕦𝕜𝕠 ✗𝕞𝕕"
global.creatorName = "RANGER XMD TECH"
global.ownernumber = '2349024437359  //creator number
global.location = "Nigeria,lagos island"
global.prefa = ['','!','.','#','&']
//================DO NOT CHANGE OR YOU'LL GET AN ERROR=============\
global.footer = "RANGER XMD TECH"//footer section
global.link = "https://chat.whatsapp.com/Bnrx29Li2mZDS2LKxI9LYM"
global.autobio = true//auto update bio
global.botName = "𝕫𝕦𝕜𝕠 ✗𝕞𝕕"
global.version = "1.0.1"
global.botname = "𝕫𝕦𝕜𝕠 ✗𝕞𝕕"
global.author = "PRINCE "
global.themeemoji = "🥷"
global.wagc = 'https://chat.whatsapp.com/Bnrx29Li2mZDS2LKxI9LYMt'
global.thumbnail = 'https://cdn.tmp.malvryx.dev/files/mxv_39ySA4EXu.jpeg'
global.richpp = ' '
global.packname = "Sticker By PRINCE"
global.author = "PRINCE "
global.creator = "2349024437359@s.whatsapp.net"
global.ownername = 'PRINCE ' 
global.onlyowner = `Only PRINCE can use this Command 🥶🥷`
  // reply 
global.database = `*To Exist In The Database Contact The Owner of this bot*`
  global.mess = {
wait: "*Configurating.......*",
   success: "*Successfully acknowledged ☑️*",
   on: "*Activated ✅*", 
   prem: "*Feature For Premium Users only*", 
   off: "*Deactivated 📛*",
   query: {
       text: "*Please, Provide A Text Query 📑*",
       link: "Please, provide a valid link 🔗*",
   },
   error: {
       fitur: "*Status 🌐: Feature Or Command error ❌*",
   },
   only: {
       group: "*Group only feature ❌*",
private: "*Private chat feature only ❌*",
       owner: "*Owner feature only ❌*",
       admin: "*bot owner feature only ❌*",
       badmin: "*Seek admin privilege's to use this command ❌*",
       premium: "*Availabe for premium users only ❌*",
   }
}

global.hituet = 0
//false=disable and true=enable
global.autoviewstatus = false
global.autoread = false //auto read messages
global.autobio = true //auto update bio
global.anti92 = true //auto block +92 
global.autoswview = true //auto view status/story

let file = require.resolve(__filename)
require('fs').watchFile(file, () => {
  require('fs').unwatchFile(file)
  console.log('\x1b[0;32m'+__filename+' \x1b[1;32mupdated!\x1b[0m')
  delete require.cache[file]
  require(file)
})

//Property of Violetkingdev  
//owner number:+2347059886720
//telegram :@VIOLETKINGDEV
