// 各版本的功能開關。ParkMate（停車位月租）沒有水電、預付電費等住宅功能。
export const FEATURES = {
  /** 預付電費、水電分攤、電費統計與電費快用完提醒 */
  electricity: false,
  /** 點交相冊（入住／退租點交） */
  handover: false,
  /** 住宅租賃定型化契約合規檢查 */
  residentialCompliance: false,
  /** 在地租金行情 */
  rentComps: false,
};
