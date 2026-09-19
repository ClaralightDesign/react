import { Slider } from "@claralight-design/react";
import { useState } from "react";

export function SliderDemo() {
  const [value, setValue] = useState(0.4);
  const [temperature, setTemperature] = useState(22);
  const [balance, setBalance] = useState(0);
  const [rating, setRating] = useState(3);

  return (
    <div className="flex max-w-md flex-col gap-6">
      {/* 1. Continuous Slider */}
      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground-hint">基础连续滑块</span>
        <Slider value={value} onValueChange={setValue} />
        <span className="text-caption text-foreground-tertiary">
          {Math.round(value * 100)}%
        </span>
      </div>

      {/* 2. Value Bubble with Balloon Tilt Physics */}
      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground-hint">
          气泡数值与气球倾斜摆动
        </span>
        <span className="text-caption text-foreground-tertiary">
          悬停或拖拽手柄时，气球从滑块升起并随拖拽惯性倾斜摆动
        </span>
        <Slider
          value={temperature}
          min={16}
          max={30}
          onValueChange={setTemperature}
          valueLabel={(v) => `${Math.round(v)}°`}
        />
      </div>

      {/* 3. Magnetic Snap Points */}
      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground-hint">磁性吸附点</span>
        <span className="text-caption text-foreground-tertiary">
          两端与中点有磁性 detent，中间的值照样停得住
        </span>
        <Slider
          value={balance}
          min={-1}
          max={1}
          snapPoints={[-1, 0, 1]}
          snapRadius={24}
          onValueChange={setBalance}
          valueLabel={(v) =>
            v === 0 ? "居中" : `${v < 0 ? "L" : "R"} ${Math.round(Math.abs(v) * 100)}`
          }
        />
      </div>

      {/* 4. Step Grid */}
      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground-hint">步进档位阶梯</span>
        <span className="text-caption text-foreground-tertiary">
          轨道在每档断开缝隙，手柄在档位间弹簧跳跃
        </span>
        <Slider
          value={rating}
          min={1}
          max={5}
          step={1}
          onValueChange={setRating}
          valueLabel={(v) => `${Math.round(v)} 档`}
        />
      </div>

      {/* 5. Disabled State */}
      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground-hint">禁用状态</span>
        <Slider value={0.3} disabled />
      </div>
    </div>
  );
}
