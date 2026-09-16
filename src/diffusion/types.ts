// 房间扩散与通风模拟 —— 数据类型

/** 通风口（排风）：位置在房间平面内坐标，单位 m；area 为风口有效面积 m²；flow 为排风量 m³/s */
export interface Vent {
  id: string;
  x: number;
  y: number;
  area: number; // m²
  flow: number; // m³/s（>=0，0 表示关闭/只登记不排风）
}

/**
 * 一次模拟的全部输入。
 * 房间为矩形：length(x 方向, m) × width(y 方向, m) × height(层高, m)。
 * 浓度采用归一化气味浓度：源点初始格浓度 = intensity（1~10），其余格为 0，
 * 因此「安全阈值」与气味强度同尺度，物理上等价于 C/C0 放大 10 倍，不影响守恒与散去时间。
 */
export interface SimParams {
  name: string;
  roomLength: number; // 房间长 L (m)
  roomWidth: number;  // 房间宽 W (m)
  roomHeight: number; // 层高 H (m)
  intensity: number;  // 气味强度（源点初始浓度, 0~10）
  sourceX: number;    // 源点 x (m)
  sourceY: number;    // 源点 y (m)
  /** 源斑物理半径 (m)：气味并非只存在于一点，初始均匀分布在该半径圆内，
   *  使初始质量与网格疏密无关（网格收敛）。网格比它粗时退化为单格。 */
  sourceRadius: number;
  vents: Vent[];
  diffusionCoeff: number; // 扩散系数 D (m²/s)
  dx: number;             // x 方向网格步长 (m)
  dy: number;             // y 方向网格步长 (m)，默认与 dx 相同
  totalTime: number;      // 总模拟时长 (s)
  dt: number;             // 时间步长 (s)
  threshold: number;      // 安全阈值（归一化浓度）
}

/** 参数归一化后的网格信息 */
export interface GridInfo {
  nx: number;
  ny: number;
  cells: number;
  dx: number;
  dy: number;
  cellVolume: number; // 每个格的体积 dx*dy*H
  sourceI: number;
  sourceJ: number;
  steps: number;
}

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  level: IssueLevel;
  field: string; // 出错字段标识，用于表单定位
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  grid: GridInfo | null;
  /** 稳定条件允许的最大时间步长 (s)，能算出时给出 */
  maxStableDt: number | null;
}

/** 一帧二维浓度场快照（按行存一维，index = j * nx + i） */
export interface SimFrame {
  t: number;
  field: Float64Array;
}

export interface SimResult {
  params: SimParams;
  grid: GridInfo;
  frames: SimFrame[];          // 均匀抽样的回放帧（含 t=0 与最后一步）
  /** 每个格「首次降到阈值」的时间；总时长结束仍未降到阈值记 Infinity */
  clearTime: Float64Array;
  /** 最晚散去位置（clearTime 最大的格）；坐标为格中心 (m) 与对应时间 */
  lastPoint: { i: number; j: number; x: number; y: number; t: number } | null;
  /** 全室最后一个超标点散去的时间 = max(clearTime)；仍有格超标则为 null */
  roomClearTime: number | null;
  /** 因全场已低于阈值 1% 而提前结束 */
  earlyStopped: boolean;
  diagnostics: {
    initialMass: number;
    finalMass: number;
    removedByVents: number; // 通风口累计排出的「质量」
    balanceError: number;   // 守恒残差 = (final+removed-initial)/initial
    equilibrium: number;    // 封闭房间的均匀平衡浓度（用于说明封闭房间）
    maxConcentration: number; // 全程出现过的最高浓度
  };
}
