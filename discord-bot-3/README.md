# Discord Bot #3 (/gen appid)

Bot Discord nhan slash command `/gen appid` va thu lay file lua + manifest tu nhieu nguon duoc cau hinh trong `GEN_SOURCES_JSON`.

## Luu y bao mat
- Khong hardcode token trong source.
- Neu token da lo, hay revoke/rotate token ngay trong Discord Developer Portal.

## Cai dat
1. Cai dependency:
   npm install
2. Tao `.env` tu `.env.example`.
3. Chay bot:
   npm start

## Cau hinh nguon
`GEN_SOURCES_JSON` la JSON array:

[
  {
    "name": "source-a",
    "luaUrl": "https://example.com/lua/{appid}.lua",
    "manifestUrl": "https://example.com/manifest/{appid}.zip",
    "headers": {
      "Authorization": "Bearer xxx"
    }
  }
]

Bot se thu lan luot tung source cho den khi lay duoc lua hoac manifest.

## Slash command
- `/gen appid:<steam_appid>`

Ket qua:
- Tra file lua (neu tim thay)
- Tra file manifest (neu tim thay)
- Neu khong co file, bot se bao chi tiet source nao da thu.
