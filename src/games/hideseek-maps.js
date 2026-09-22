// Top-down map layouts for Hide & Seek. Coordinates are in a shared 560x360 canvas.
// `rooms` are named zones used for rendering + seeker hints (which room is a hider closest to).
const W = 560, H = 360;

const MAPS = [
  {
    id: 'house', name: 'منزل 🏠',
    w: W, h: H,
    rooms: [
      { name: 'الصالة', x: 20, y: 20, w: 220, h: 150 },
      { name: 'المطبخ', x: 260, y: 20, w: 160, h: 150 },
      { name: 'الحديقة', x: 440, y: 20, w: 100, h: 320 },
      { name: 'غرفة النوم', x: 20, y: 190, w: 180, h: 150 },
      { name: 'الحمام', x: 220, y: 190, w: 100, h: 150 },
      { name: 'الممر', x: 340, y: 190, w: 80, h: 150 }
    ],
    spawnSeeker: { x: 500, y: 340 },
    spawnHiders: [{ x: 60, y: 60 }, { x: 300, y: 60 }, { x: 60, y: 230 }, { x: 260, y: 230 }, { x: 370, y: 230 }, { x: 480, y: 60 }, { x: 480, y: 150 }, { x: 480, y: 260 }]
  },
  {
    id: 'hotel', name: 'فندق 🏨',
    w: W, h: H,
    rooms: [
      { name: 'الاستقبال', x: 20, y: 20, w: 160, h: 120 },
      { name: 'غرفة 101', x: 200, y: 20, w: 110, h: 120 },
      { name: 'غرفة 102', x: 330, y: 20, w: 110, h: 120 },
      { name: 'المصعد', x: 460, y: 20, w: 80, h: 320 },
      { name: 'الممر الطويل', x: 20, y: 160, w: 420, h: 60 },
      { name: 'غرفة 103', x: 20, y: 240, w: 110, h: 100 },
      { name: 'غرفة 104', x: 150, y: 240, w: 110, h: 100 },
      { name: 'الصالة الخلفية', x: 280, y: 240, w: 160, h: 100 }
    ],
    spawnSeeker: { x: 500, y: 180 },
    spawnHiders: [{ x: 60, y: 60 }, { x: 240, y: 60 }, { x: 370, y: 60 }, { x: 70, y: 280 }, { x: 200, y: 280 }, { x: 330, y: 280 }, { x: 60, y: 190 }, { x: 400, y: 190 }]
  },
  {
    id: 'factory', name: 'مصنع 🏭',
    w: W, h: H,
    rooms: [
      { name: 'خط الإنتاج', x: 20, y: 20, w: 300, h: 100 },
      { name: 'المستودع', x: 340, y: 20, w: 200, h: 160 },
      { name: 'غرفة التحكم', x: 20, y: 140, w: 140, h: 90 },
      { name: 'ساحة الحاويات', x: 180, y: 140, w: 140, h: 190 },
      { name: 'خط التعبئة', x: 340, y: 200, w: 200, h: 130 },
      { name: 'المخرج', x: 20, y: 250, w: 140, h: 80 }
    ],
    spawnSeeker: { x: 440, y: 40 },
    spawnHiders: [{ x: 60, y: 50 }, { x: 200, y: 60 }, { x: 400, y: 60 }, { x: 60, y: 170 }, { x: 240, y: 220 }, { x: 400, y: 250 }, { x: 90, y: 280 }, { x: 480, y: 100 }]
  }
];

function pickMap() { return MAPS[Math.floor(Math.random() * MAPS.length)]; }
function roomAt(map, x, y) {
  const r = map.rooms.find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  return r ? r.name : 'مكان مجهول';
}

module.exports = { MAPS, pickMap, roomAt };
