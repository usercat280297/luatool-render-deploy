-- 3764200's Lua and Manifest Created by Morrenus
-- Resident Evil Requiem
-- Created: February 27, 2026 at 00:07:50 EST
-- Website: https://manifest.morrenus.xyz/
-- Total Depots: 4
-- Total DLCs: 2
-- Shared Depots: 1

-- MAIN APPLICATION
addappid(3764200) -- Resident Evil Requiem
-- MAIN APP DEPOTS
addappid(3764201, 1, "bdf443ffde6449192b9863c0fa5e3cda31fdaa5e4d33e5bcded62dc2085b7cb8") -- Depot 3764201
setManifestid(3764201, "5691830764668778509", 78739146467)
-- SHARED DEPOTS (from other apps)
addappid(228989, 1, "ad69276eb476cf06c40312df7376d63deac0c838b9a2767005be8bb306ffb853") -- VC 2022 Redist (Shared from App 228980)
setManifestid(228989, "3514306556860204959", 39590283)
-- DLCS WITH DEDICATED DEPOTS
-- Resident Evil Requiem - Graces Costume Apocalypse (AppID: 3990800)
addappid(3990800)
addappid(3990800, 1, "f5bf116706491176c9eee46a96fe1faa70b3f771d75ccb34f0c8962097a907e5") -- Resident Evil Requiem - Graces Costume Apocalypse - Depot 3990800
setManifestid(3990800, "9181787779883827112", 154141549)
-- Resident Evil Requiem - Deluxe Kit (AppID: 3990820)
addappid(3990820)
addappid(3990820, 1, "9ae4713cb4114effdd34d1cd54dbda8a560f27a05aef06fbaa0370748f69d15c") -- Resident Evil Requiem - Deluxe Kit - Depot 3990820
setManifestid(3990820, "509708311968316285", 989393708)
-- EMPTY DEPOTS (no content on any branch)
-- addappid(3764203) -- Depot 3764203 (empty depot)
-- addappid(3764204) -- Depot 3764204 (empty depot)