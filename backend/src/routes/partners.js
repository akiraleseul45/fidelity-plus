const express = require('express');
const partnersRepo = require('../repositories/partners');
const { generalLimiter } = require('../middleware/rateLimit');
const { CATEGORY_VALUES, SERVICE_MODE_VALUES } = require('../lib/business');

const router = express.Router();

router.get('/', generalLimiter, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    // Optional filters. `category` may repeat or be comma-separated; only
    // known values are kept. `serviceMode` must be a known value.
    const rawCat = [].concat(req.query.category || []).join(',');
    const categories = rawCat
      .split(',')
      .map((s) => s.trim())
      .filter((s) => CATEGORY_VALUES.includes(s));
    const serviceMode = SERVICE_MODE_VALUES.includes(req.query.serviceMode)
      ? req.query.serviceMode
      : null;

    const rows = await partnersRepo.listPublic({
      limit,
      offset,
      categories: categories.length ? categories : null,
      serviceMode,
    });
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
      category: p.category,
      serviceMode: p.serviceMode,
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
