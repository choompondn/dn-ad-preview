# DN Ad Preview — Spec (v1, 10 Nov 2026)

## เป้าหมาย
ให้ Sale เปิดหน้า dailynews.co.th จริง แล้วเห็น creative ของลูกค้าที่ **Active ใน GAM วันนี้** อยู่ใน slot จริง เพื่อแคปภาพส่งลูกค้ารายวัน — แม้ line item จะ deliver ครบเป้าของวันแล้ว (pacing เต็ม) ก็ตาม

**ไม่อยู่ในขอบเขต:** รีพอร์ตสิ้นเดือน (มีอยู่แล้ว), third-party tag, แคปภาพอัตโนมัติ (ต่อยอดภายหลัง)

## สถาปัตยกรรม
- Repo: `choompondn/dn-ad-preview` (private) → Vercel auto-deploy
- ไม่มีฐานข้อมูล ไม่มี cron — เรียก GAM API สดแล้วแคช

```
Sale ─(รหัสผ่าน)─> Vercel: หน้ารายการ creative
                      │  /api/creatives  ── GAM API (Service Account, read-only)
                      │
                      └─ ปุ่ม "เปิดบนหน้าจริง" ─> https://www.dailynews.co.th/<path>?dn_mock=<token>
                                                     │
                                       dn-gam.php ── fetch /api/mock/<token> (public, signed)
                                                     └─ สวม creative ลง div ของ slot, ข้าม ad request ของ slot นั้น
```

## ส่วนประกอบ

### 1. รหัสผ่าน (middleware)
- รหัสเดียวร่วมกัน เก็บใน env `APP_PASSWORD`
- ใส่ถูก → cookie HMAC อายุ 30 วัน · เปลี่ยนรหัส = cookie เก่าใช้ไม่ได้
- ครอบทุกหน้าและ `/api/creatives` · ยกเว้น `/api/mock/*`

### 2. `/api/creatives`
1. LineItemService: `status IN (DELIVERING, READY)` และวันนี้อยู่ใน start–end (Asia/Bangkok)
   - รวม line item ที่ pacing เต็มของวันแล้ว (ยัง DELIVERING)
2. LineItemCreativeAssociationService: `status = ACTIVE` ของ line item ข้างบน
3. CreativeService: เฉพาะ `ImageCreative` และ HTML5 ที่อัปโหลดเข้า GAM — ประเภทอื่นแสดงเป็น "ไม่รองรับ"
4. OrderService: ชื่อลูกค้า (advertiser) / order
5. Inventory targeting ของ line item → ชื่อ ad unit → slot (ดูข้อ 4)
- แคช 1 ชั่วโมง + ปุ่ม "รีเฟรช" ข้ามแคช

### 3. หน้า Sale
- การ์ดแยก ลูกค้า → line item → creative: thumbnail, ขนาด, slot, วันสิ้นสุด
- ค้นหา / กรองตามลูกค้า
- **เลือกหน้าปลายทาง:** dropdown หน้าที่ตั้งไว้ (หน้าแรก, หน้าหมวด, ข่าวล่าสุด) + ช่องวาง URL เอง
  - ค่าเริ่มต้นเดาจาก targeting: ad unit `Homepage_*` → `/`, key-value `category` → `/<category>/`, อื่น ๆ → หน้าแรก
- ปุ่ม **เปิด Desktop** / **เปิด Mobile** (Mobile = เปิดหน้าต่างขนาด 390×844 ให้แคปด้วย DevTools/มือถือจริง)

### 4. Slot mapping
ทุกหน้ามี 3 div เท่านั้น: `div-ads-leaderboard`, `div-ads-sticky`, `div-ads-postarticle`
- map จากชื่อ ad unit ที่ line item target ไว้ ด้วยตาราง `config/slots.json` เช่น
  `Regional_Leaderboard → leaderboard`, `Homepage_2ndRectangle → postarticle`
- ad unit ไม่อยู่ในตาราง → เดาจากขนาด (กว้าง ≥ 728 → leaderboard) และให้ Sale เลือก slot เองบนการ์ด
- line item target หลาย ad unit → มีปุ่มแยกต่อ slot

### 5. `/api/mock/<token>` (public)
- token = HMAC(`MOCK_SECRET`) ของ `{creativeId, slot, exp}` · หมดอายุ 24 ชม.
- คืนค่า `{slot, type, width, height, imageUrl | html5Url, clickUrl}` ของ creative เดียว — ไม่มีชื่อลูกค้า
- HTML5: proxy bundle จาก GAM แสดงใน iframe ขนาดเท่า creative
- CORS: อนุญาตเฉพาะ `https://www.dailynews.co.th`

### 6. แก้ `dn-gam.php` (ครั้งเดียว)
- มี `dn_mock` ใน URL → fetch `/api/mock/<token>`
- ไม่เรียก `googletag.display` / refresh ของ slot นั้น · slot อื่นทำงานปกติ
- ใส่ `<img>` (ลิงก์ clickUrl) หรือ `<iframe>` ลงใน div ตามขนาด · คงพื้นที่ที่ CSS จองไว้
- token เสีย/หมดอายุ → ไม่ทำอะไร หน้าแสดงโฆษณาปกติ
- impression/click ไม่ถูกส่งเข้า GAM

## Env (Vercel)
`GAM_KEY` (JSON ของ Service Account), `GAM_NETWORK`, `APP_PASSWORD`, `MOCK_SECRET`, `SITE_ORIGIN=https://www.dailynews.co.th`

## Stack
Next.js (App Router) + TypeScript · GAM SOAP API v202x ผ่าน `google-auth-library` + เรียก SOAP เอง (ไม่มี SDK ทางการสำหรับ Node)

## คำถามที่ยังเปิด
- รายชื่อ ad unit ทั้งหมดใน GAM เพื่อทำ `config/slots.json`
- รายการหน้าปลายทางที่ใช้บ่อย สำหรับ dropdown
