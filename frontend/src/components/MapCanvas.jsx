import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { theme } from 'antd';

/* 안전한 JSON 파싱 */
function safeParse(raw, fallback = {}) {
  if (raw == null) return fallback;
  let v = raw;
  try {
    if (typeof v === 'string') v = JSON.parse(v);
    if (typeof v === 'string') v = JSON.parse(v);
  } catch {
    return fallback;
  }
  return v ?? fallback;
}

/* 각도 보간 (최단 경로) */
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

const ICON_MM = { width: 800, height: 1200 };
const AMR_LERP_SPEED = 0.15; // 0~1 — AMR 위치 보간 속도 (프레임당)

/**
 * 맵 캔버스 컴포넌트
 * - stations / paths / normalPoints 그리기
 * - AMR 위치 표시 (화살표) — lerp 보간으로 부드러운 이동
 * - 패닝 & 줌
 * - station/AMR 호버 툴팁
 * - AMR 추적 (trackAmrName)
 */
const MapCanvas = forwardRef(function MapCanvas({ mapData, amrs = [], trackAmrName = null, onNavigate }, ref) {
  const { token } = theme.useToken();
  const contRef = useRef(null);
  const canvRef = useRef(null);

  const [scale, setScale] = useState(1.5);
  const [offset, setOffset] = useState({ x: 100, y: 100 });
  const [sf, setSf] = useState(1);
  const [drag, setDrag] = useState(false);
  const [last, setLast] = useState({ x: 0, y: 0 });

  // 호버 상태
  const [tooltip, setTooltip] = useState(null);

  // 우클릭 컨텍스트 메뉴
  const [ctxMenu, setCtxMenu] = useState(null); // { station, x, y }

  // ─── AMR 보간 위치 (렌더용) ───
  // { [amr_name]: { x, y, deg } } — 실제 렌더에 사용하는 위치
  const interpolatedRef = useRef({});

  // amrs 폴링 데이터가 바뀌면 target 업데이트
  const amrTargetsRef = useRef({}); // { [amr_name]: { x, y, deg, status, ...rest } }
  useEffect(() => {
    const targets = {};
    for (const amr of amrs) {
      targets[amr.amr_name] = {
        x: amr.pos_x ?? 0,
        y: amr.pos_y ?? 0,
        deg: amr.deg ?? 0,
      };
      // 처음 보는 AMR이면 즉시 위치 설정
      if (!interpolatedRef.current[amr.amr_name]) {
        interpolatedRef.current[amr.amr_name] = {
          x: amr.pos_x ?? 0,
          y: amr.pos_y ?? 0,
          deg: amr.deg ?? 0,
        };
      }
    }
    amrTargetsRef.current = targets;
  }, [amrs]);

  // 펄스 + AMR 보간 — 단일 requestAnimationFrame 루프
  const [pulseTime, setPulseTime] = useState(0);
  const [renderTick, setRenderTick] = useState(0);
  useEffect(() => {
    let id;
    let lastT = 0;
    const animate = (t) => {
      // 펄스 30fps
      if (t - lastT >= 33) {
        setPulseTime(t);
        lastT = t;

        // AMR 위치 보간
        const targets = amrTargetsRef.current;
        const interp = interpolatedRef.current;
        let changed = false;
        for (const name of Object.keys(targets)) {
          const tgt = targets[name];
          const cur = interp[name];
          if (!cur) {
            interp[name] = { ...tgt };
            changed = true;
            continue;
          }
          const dx = tgt.x - cur.x;
          const dy = tgt.y - cur.y;
          if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
            cur.x += dx * AMR_LERP_SPEED;
            cur.y += dy * AMR_LERP_SPEED;
            cur.deg = lerpAngle(cur.deg, tgt.deg, AMR_LERP_SPEED);
            changed = true;
          } else {
            cur.x = tgt.x;
            cur.y = tgt.y;
            cur.deg = tgt.deg;
          }
        }
        if (changed) setRenderTick((v) => v + 1);
      }
      id = requestAnimationFrame(animate);
    };
    animate(0);
    return () => cancelAnimationFrame(id);
  }, []);

  /* 외부에서 호출 가능한 centerOn 메서드 */
  useImperativeHandle(ref, () => ({
    centerOn(worldX, worldY) {
      if (!contRef.current) return;
      const rect = contRef.current.getBoundingClientRect();
      setOffset({
        x: rect.width / 2 - worldX * sf * scale,
        y: rect.height / 2 - worldY * sf * scale,
      });
    },
  }), [sf, scale]);

  /* DPI 대응 */
  const fitCanvas = useCallback(() => {
    if (!contRef.current || !canvRef.current) return;
    const rect = contRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const c = canvRef.current;
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    c.style.width = `${rect.width}px`;
    c.style.height = `${rect.height}px`;
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useEffect(() => {
    fitCanvas();
    window.addEventListener('resize', fitCanvas);
    return () => window.removeEventListener('resize', fitCanvas);
  }, [fitCanvas]);

  /* 맵 변경 시 중앙 세팅 */ 
  useEffect(() => {
    if (!contRef.current || !mapData) return;
    const hdr = safeParse(mapData.additional_info).header || {};
    const { minPos, maxPos, resolution } = hdr;
    if (!minPos || !maxPos) return;

    const nSf = resolution ? 1 / resolution : 1;
    setSf(nSf);

    const midX = (minPos.x + maxPos.x) / 2;
    const midY = (minPos.y + maxPos.y) / 2;
    const rect = contRef.current.getBoundingClientRect();
    setScale(1.5);
    setOffset({
      x: (rect.width / 2 - midX * nSf * 1.5 ) - 650,
      y: (rect.height / 2 - midY * nSf * 1.5) - 200,
    });
  }, [mapData]);

  /* AMR 추적 — 부드러운 lerp 애니메이션으로 중앙 유지 */
  const trackTargetRef = useRef(null);

  // 추적 대상의 목표 오프셋 계산 (보간 위치 기준)
  useEffect(() => {
    if (!trackAmrName || !contRef.current) {
      trackTargetRef.current = null;
      return;
    }
    const ipos = interpolatedRef.current[trackAmrName];
    if (!ipos) return;
    const rect = contRef.current.getBoundingClientRect();
    trackTargetRef.current = {
      x: rect.width / 2 - ipos.x * sf * scale,
      y: rect.height / 2 - ipos.y * sf * scale,
    };
  }, [trackAmrName, renderTick, sf, scale]);

  // 부드러운 보간 루프
  useEffect(() => {
    if (!trackAmrName) return;
    let rafId;
    const LERP_SPEED = 0.12; // 0~1 — 클수록 빠름
    const SNAP_THRESHOLD = 0.3;

    const tick = () => {
      const tgt = trackTargetRef.current;
      if (tgt) {
        setOffset((prev) => {
          const dx = tgt.x - prev.x;
          const dy = tgt.y - prev.y;
          if (Math.abs(dx) < SNAP_THRESHOLD && Math.abs(dy) < SNAP_THRESHOLD) return tgt;
          return {
            x: prev.x + dx * LERP_SPEED,
            y: prev.y + dy * LERP_SPEED,
          };
        });
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [trackAmrName]);

  /* 좌표 변환 */
  const transform = useCallback(
    (x, y) => {
      const h = contRef.current?.getBoundingClientRect().height || 0;
      return {
        x: x * sf * scale + offset.x,
        y: h - (y * sf * scale + offset.y),
      };
    },
    [sf, scale, offset]
  );

  const rPix = ((ICON_MM.width / 1000) * sf * scale) / 6;

  /* AMR 상태 → 색상 */
  const getAmrColor = useCallback((amr) => {
    const s = amr.status;
    if (s === 'NO_CONN') return '#d9d9d9';
    if (s === 'E-STOP') return '#eb2f96';
    if (s === 'ERROR') return '#ff4d4f';
    if (s === 'STOP') return '#faad14';
    if (s === 'MOVING') return token.colorPrimary;
    if (s === 'IDLE') return '#52c41a';
    return '#8c8c8c';
  }, [token.colorPrimary]);

  /* 그리기 */
  useEffect(() => {
    const c = canvRef.current;
    if (!c || !mapData) return;
    const ctx = c.getContext('2d');
    const rect = contRef.current.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width * 2, rect.height * 2);

    // normalPosList
    const addInfo = safeParse(mapData.additional_info);
    const normalPoints = addInfo.normalPosList ?? addInfo.normalPointList ?? [];
    if (normalPoints.length) {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      normalPoints.forEach((pt) => {
        const { x, y } = transform(pt.x, pt.y);
        ctx.moveTo(x + 0.5, y);
        ctx.arc(x, y, 0.5, 0, Math.PI * 2);
      });
      ctx.fill();
    }

    // paths
    const paths = safeParse(mapData.paths).paths ?? [];
    const stations = safeParse(mapData.stations).stations ?? [];
    if (paths.length) {
      ctx.strokeStyle = 'rgba(255, 77, 79, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      paths.forEach((p) => {
        let s = p.coordinates?.start;
        let e = p.coordinates?.end;
        if (!s || !e) {
          s = stations.find((st) => String(st.id) === String(p.start));
          e = stations.find((st) => String(st.id) === String(p.end));
        }
        if (!s || !e) return;
        const sp = transform(s.x, s.y);
        const ep = transform(e.x, e.y);
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(ep.x, ep.y);
      });
      ctx.stroke();
    }

    // stations
    if (stations.length) {
      ctx.fillStyle = '#fa8c16';
      ctx.beginPath();
      stations.forEach((st) => {
        const p = transform(st.x, st.y);
        ctx.moveTo(p.x + rPix, p.y);
        ctx.arc(p.x, p.y, rPix, 0, Math.PI * 2);
      });
      ctx.fill();

      ctx.fillStyle = '#595959';
      ctx.font = `${Math.max(9, 11 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      stations.forEach((st) => {
        const p = transform(st.x, st.y);
        ctx.fillText(st.name || st.id, p.x, p.y + rPix + 2);
      });
    }

    // AMRs — 보간된 위치 사용
    const interp = interpolatedRef.current;
    amrs.forEach((amr) => {
      const ipos = interp[amr.amr_name] || { x: amr.pos_x ?? 0, y: amr.pos_y ?? 0, deg: amr.deg ?? 0 };
      const p = transform(ipos.x, ipos.y);
      const color = getAmrColor(amr);
      const sizePx = Math.max(10, (ICON_MM.width / 1000) * sf * scale * 0.8);
      // 펄스
      if (amr.status !== 'NO_CONN') {
        const phase = (pulseTime % 2000) / 2000;
        const pr = sizePx * (1 + Math.sin(phase * Math.PI * 2) * 0.3);
        ctx.save();
        ctx.globalAlpha = 0.4 * (1 - phase * 0.5);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 화살표 (삼각형) — 보간된 각도 사용
      const angle = -(ipos.deg) + Math.PI / 2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -sizePx * 0.6);
      ctx.lineTo(-sizePx * 0.35, sizePx * 0.4);
      ctx.lineTo(sizePx * 0.35, sizePx * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 이름 라벨
      ctx.fillStyle = '#262626';
      ctx.font = `bold ${Math.max(9, 10 * scale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(amr.amr_name, p.x, p.y + sizePx * 0.6 + 3);
    });
  }, [mapData, amrs, transform, rPix, scale, pulseTime, getAmrColor, renderTick]);

  /* 마우스 이벤트 */
  const getPos = (e) => {
    const r = canvRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e) => {
    if (e.button !== 0) return;
    setDrag(true);
    setLast(getPos(e));
  };

  const onMove = (e) => {
    if (drag && !trackAmrName) {
      const p = getPos(e);
      setOffset((o) => ({
        x: o.x + p.x - last.x,
        y: o.y - p.y + last.y,
      }));
      setLast(p);
    }

    if (!canvRef.current) return;
    const pos = getPos(e);

    let found = null;
    const interp = interpolatedRef.current;
    amrs.forEach((amr) => {
      const ipos = interp[amr.amr_name] || { x: amr.pos_x ?? 0, y: amr.pos_y ?? 0 };
      const p = transform(ipos.x, ipos.y);
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      if (dx * dx + dy * dy <= (rPix + 8) ** 2) {
        found = amr;
      }
    });

    if (found) {
      setTooltip({
        text: `${found.amr_name} [${found.status}] 배터리: ${found.battery ?? '-'}%`,
        x: e.clientX,
        y: e.clientY,
      });
    } else {
      const stations = safeParse(mapData?.stations).stations ?? [];
      const st = stations.find((s) => {
        const p = transform(s.x, s.y);
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        return dx * dx + dy * dy <= rPix * rPix;
      });
      if (st) {
        setTooltip({
          text: st.name || st.id,
          x: e.clientX,
          y: e.clientY,
        });
      } else {
        setTooltip(null);
      }
    }
  };

  const onUp = () => setDrag(false);

  /* 우클릭 → 스테이션 위에서 컨텍스트 메뉴 표시 */
  const onContextMenu = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    const stations = safeParse(mapData?.stations).stations ?? [];
    const hit = stations.find((s) => {
      const p = transform(s.x, s.y);
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      return dx * dx + dy * dy <= Math.max(rPix, 8) ** 2;
    });
    if (hit) {
      // 컨테이너 기준 좌표
      const rect = contRef.current.getBoundingClientRect();
      setCtxMenu({
        station: hit,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    } else {
      setCtxMenu(null);
    }
  };

  const onWheel = (e) => {
    e.preventDefault();
    const fac = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const ns = Math.max(0.1, Math.min(scale * fac, 80));

    if (trackAmrName) {
      // 추적 중엔 스케일만 변경 — useEffect(centerOnAmr)가 재센터링 처리
      setScale(ns);
    } else {
      const p = getPos(e);
      const ratio = ns / scale;
      const rect = contRef.current.getBoundingClientRect();
      setScale(ns);
      setOffset((o) => ({
        x: o.x * ratio + p.x * (1 - ratio),
        y: o.y * ratio + (rect.height - p.y) * (1 - ratio),
      }));
    }
  };

  return (
    <div
      ref={contRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: token.colorBgContainer,
        borderRadius: token.borderRadius,
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          cursor: drag ? 'grabbing' : 'grab',
        }}
        onMouseDown={(e) => { setCtxMenu(null); onDown(e); }}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
        onWheel={onWheel}
        onContextMenu={onContextMenu}
      />

      {/* 우클릭 컨텍스트 메뉴 — 스테이션에 AMR 이동 명령 */}
      {ctxMenu && (
        <div
          style={{
            position: 'absolute',
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 200,
            background: token.colorBgElevated,
            borderRadius: token.borderRadiusLG,
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
            border: `1px solid ${token.colorBorderSecondary}`,
            minWidth: 180,
            overflow: 'hidden',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div
            style={{
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: token.colorTextSecondary,
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorBgLayout,
            }}
          >
            📍 {ctxMenu.station.name || ctxMenu.station.id} 으로 이동
          </div>

          {/* AMR 목록 */}
          {amrs.length === 0 ? (
            <div style={{ padding: '12px', fontSize: 12, color: token.colorTextSecondary, textAlign: 'center' }}>
              등록된 AMR이 없습니다
            </div>
          ) : (
            amrs.map((amr) => (
              <div
                key={amr.amr_id}
                onClick={() => {
                  if (onNavigate) {
                    onNavigate(amr, ctxMenu.station);
                  }
                  setCtxMenu(null);
                }}
                style={{
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = token.colorBgTextHover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ fontWeight: 500 }}>{amr.amr_name}</span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background:
                      amr.status === 'IDLE' ? '#52c41a20' :
                      amr.status === 'MOVING' ? '#1677ff20' :
                      amr.status === 'NO_CONN' ? '#8c8c8c20' : '#ff4d4f20',
                    color:
                      amr.status === 'IDLE' ? '#52c41a' :
                      amr.status === 'MOVING' ? '#1677ff' :
                      amr.status === 'NO_CONN' ? '#8c8c8c' : '#ff4d4f',
                  }}
                >
                  {amr.status}
                </span>
              </div>
            ))
          )}

          {/* 취소 */}
          <div
            onClick={() => setCtxMenu(null)}
            style={{
              padding: '6px 12px',
              fontSize: 11,
              color: token.colorTextSecondary,
              textAlign: 'center',
              cursor: 'pointer',
              borderTop: `1px solid ${token.colorBorderSecondary}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = token.colorBgTextHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            취소
          </div>
        </div>
      )}

      {/* 툴팁 */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            top: tooltip.y + 12,
            left: tooltip.x + 12,
            background: 'rgba(0,0,0,0.78)',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 100,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
});

export default MapCanvas;
