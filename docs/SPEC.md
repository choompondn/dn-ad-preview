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
- **เลือกหน้าปลายทางได้หลายหน้าพร้อมกัน** (checkbox) จาก `config/pages.json` + ช่อง Custom (ใส่ได้หลาย URL บรรทัดละ 1, รับทั้ง path และ URL เต็มของ dailynews.co.th)
  - ค่าเริ่มต้นติ๊กจาก targeting: key-value `category` → หน้าหมวดนั้น, ไม่ระบุ → Homepage
  - ปุ่ม "เลือกทั้งหมด / ล้าง"
- เลือก creative ได้หลายตัว × หลายหน้า → สร้าง **รายการลิงก์** (หน้า × creative) แต่ละแถวมีปุ่มเปิด + ปุ่ม **เปิดทั้งหมด** (เปิดแท็บทีละหน้า; ครั้งแรกเบราว์เซอร์จะถามให้อนุญาต pop-up)
- creative หลายตัวที่อยู่คนละ slot → รวมใน token เดียวได้ (1 หน้าแสดงได้ทั้ง 3 slot พร้อมกัน)
- ปุ่ม **Desktop** / **Mobile** (Mobile = หน้าต่างขนาด 390×844 ให้แคปด้วย DevTools/มือถือจริง)

#### `config/pages.json`
| ชื่อ | path |
|---|---|
| Homepage | `/` |
| ทั่วไทย | `/regional/` |
| กทม. | `/bangkok/` |
| อาชญากรรม | `/crime/` |
| การเมือง | `/politics/` |
| เศรษฐกิจ | `/economic/` |
| บันเทิง | `/entertainment/` |
| กีฬา | `/sport/` |
| ต่างประเทศ | `/foreign/` |
| ไลฟ์สไตล์ | `/lifestyle/` |
| นวัตกรรมขนส่ง | `/transport/` |
| ยานยนต์ | `/auto/` |
| เทคโนโลยี | `/technology/` |
| การศึกษา-ศาสนา | `/education/` |
| สังคม | `/society/` |
| ท้องถิ่น | `/local/` |
| เกษตร | `/agriculture/` |
| Sustain Daily | `/sustainable/` |
| Daily Beauty | `/beauty/` |
| People | `/people/` |
| หมวดพิเศษ | `/special/` |
| ดวง-มูเตลู | `/horoscope/` |
| Custom | ผู้ใช้กรอกเอง |

### 4. Slot mapping
ทุกหน้าใช้ ad unit 3 ตัวเท่านั้น (`config/slots.json`):

| div | Ad unit | ID | Code |
|---|---|---|---|
| `div-ads-leaderboard` | Regional_Leaderboard | 90751040 | `Regional_Leaderboard` |
| `div-ads-sticky` | Regional_Rectangle | 90751160 | `Regional_Rectangle(S2)` |
| `div-ads-postarticle` | Regional_Postarticle | 23196688839 | `regional_postarticle` |

- map ด้วย **ad unit ID** จาก inventory targeting ของ line item (ไม่พึ่งชื่อ)
- line item target ad unit แม่ / ไม่ได้ target 3 ตัวนี้ → ให้ Sale เลือก slot เองบนการ์ด (เดาเริ่มต้นจากขนาด: กว้าง ≥ 728 → leaderboard)
- line item target หลาย ad unit → เลือก slot ได้ตามที่ target

> **เปลี่ยนตอนลงมือ (v1.2):** ไม่ใช้ `/api/mock` แล้ว — token บรรจุข้อมูล creative เอง และ `wp/dn-ad-preview.php` ตรวจลายเซ็นฝั่ง PHP (secret ร่วม `DN_AD_PREVIEW_SECRET` = `MOCK_SECRET`) จึงรู้ก่อนโหลด GPT ว่าจะ mock slot ไหน ไม่มี ad request หลุด · Stack เป็น Node ล้วนไม่มี dependency (ไม่ใช้ Next.js) · ดู README

### 5. `/api/mock/<token>` (public) — ยกเลิก ดูหมายเหตุข้างบน
- token = HMAC(`MOCK_SECRET`) ของ `{items: [{creativeId, slot}], exp}` · หมดอายุ 24 ชม. · สูงสุด 1 creative ต่อ slot
- คืนค่า `[{slot, type, width, height, imageUrl | html5Url, clickUrl}]` — ไม่มีชื่อลูกค้า
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
- (ปิดแล้ว) ad unit 3 ตัว และรายการหน้าปลายทาง — 11 พ.ย. 2026
