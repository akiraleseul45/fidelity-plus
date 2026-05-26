const express = require('express');
const partnersRepo = require('../repositories/partners');
const { generalLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/', generalLimiter, async (req, res, next) => {
  try {
    const rows = await partnersRepo.listPublic();
    const items = rows.map((p) => ({
      id: p.id,
      ownerName: p.ownerName,
      companyName: p.companyName,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      phoneFixed: p.phoneFixed,
      phoneMobile: p.phoneMobile,
      imageUrl: p.imageUrl,
      rewardThreshold: p.rewardThreshold,
      rewardType: p.rewardType,
      rewardValue: p.rewardValue,
      status: p.status,
    }));
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
