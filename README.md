# DN Ad Preview

แสดง creative ที่ Active ใน GAM วันนี้บนหน้า dailynews.co.th จริง (แม้ line item ส่งครบเป้าของวันแล้ว) เพื่อให้ Sale แคปภาพส่งลูกค้า — spec: [`docs/SPEC.md`](docs/SPEC.md)

ไม่มี dependency (Node 18+ ล้วน) · Vercel ไม่ต้อง build

## โครงสร้าง
| path | หน้าที่ |
|---|---|
| `public/index.html` | หน้าสำหรับ Sale (ใส่รหัส → เลือก creative × หน้า × อุปกรณ์ → ลิงก์) |
| `api/login.js` | ตรวจรหัสผ่าน → cookie 30 วัน |
| `api/creatives.js` | ดึง line item / LICA / creative ที่ Active วันนี้จาก GAM (แคช 1 ชม.) |
| `api/sign.js` | ลงลายเซ็น token สำหรับ `?dn_mock=` (อายุ 24 ชม.) |
| `api/h5.js` | เสิร์ฟไฟล์ใน bundle HTML5 (`/h5/<id>/<sig>/...`) |
| `config/slots.json` | ad unit ID → div (3 ตัว) |
| `config/pages.json` | หน้าปลายทาง |
| `wp/dn-ad-preview.php` | mu-plugin บน WordPress: ตรวจ token แล้วสวม creative แทน slot นั้น |

## ติดตั้ง

### 1. GAM
1. Google Cloud → สร้าง Service Account → ดาวน์โหลด key JSON
2. GAM → Admin → Global settings → เปิด **API access** · จด **Network code**
3. GAM → Admin → Access & authorization → Users → **Add a service account user** → ใส่อีเมล Service Account · role ที่อ่าน Orders/Line items/Creatives ได้ (อ่านอย่างเดียว)

### 2. Vercel
1. Add New → Project → Import `choompondn/dn-ad-preview` · Framework: **Other** · ไม่ต้องตั้ง build
2. Environment Variables:

| ชื่อ | ค่า |
|---|---|
| `GAM_KEY` | เนื้อไฟล์ key JSON ทั้งก้อน (หรือ base64 ของไฟล์) |
| `GAM_NETWORK` | Network code |
| `APP_PASSWORD` | รหัสผ่านที่จะให้ Sale |
| `MOCK_SECRET` | สุ่มยาว ๆ เช่น `openssl rand -hex 32` |
| `SITE_ORIGIN` | `https://www.dailynews.co.th` |
| `GAM_API_VERSION` | (ไม่บังคับ) ค่าเริ่มต้น `v202508` — ถ้า GAM แจ้งว่าเวอร์ชันหมดอายุ ให้ใส่เวอร์ชันล่าสุด |

3. Deploy → เปิดเว็บ ใส่รหัส ต้องเห็นรายการ creative

### 3. WordPress (ทำบน staging ก่อน)
1. อัปโหลด `wp/dn-ad-preview.php` → `wp-content/mu-plugins/`
2. `wp-config.php`: `define( 'DN_AD_PREVIEW_SECRET', '<ค่าเดียวกับ MOCK_SECRET>' );`
3. ล้าง cache

**ตรวจผล:** สร้างลิงก์จากหน้า Sale → เปิด → slot ที่เลือกต้องแสดง creative · ใน console `window.dnAdPreview` แสดงรายการ · เปิด `?google_force_console` แล้วต้อง**ไม่มี** request ของ slot ที่ mock

**Rollback:** ลบไฟล์ใน mu-plugins

## วิธีทำงานของ mock (ไม่มี impression เข้า GAM)
PHP ตรวจลายเซ็น token ก่อนส่งหน้า → ใส่ script ที่ `wp_head` priority 0 ซึ่งดักใน `googletag.cmd` ก่อน dn-gam:
- `defineSlot` ของ div ที่ mock → คืน stub (GPT ไม่รู้จัก slot นั้นเลย)
- `display` / `refresh` → ข้าม slot ที่ mock แล้ววาง `<img>` หรือ `<iframe>` (HTML5) ลงใน div แทน
token ผิด/หมดอายุ → หน้าแสดงโฆษณาปกติ

## ทดสอบ
`node test/run.js` (ต้องมี `php` สำหรับเทสต์ข้ามภาษา)
