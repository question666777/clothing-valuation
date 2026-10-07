App({
  globalData: {
    // 识别确认后的物品信息，拆解页从这里取；不落本地缓存，避免脏数据进估价流程
    pendingItem: null,
    pendingPrice: null
  }
});
