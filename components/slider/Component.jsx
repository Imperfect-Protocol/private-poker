"use client";

import { Component as ReactComponent } from 'react';

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function nearestSteppedValue(rawValue, min, max, step) {
  if (max <= min) return min;
  if (!step || step <= 1) return clamp(rawValue, min, max);

  const stepIndex = (rawValue - min) / step;
  const lower = min + Math.floor(stepIndex) * step;
  const upper = min + Math.ceil(stepIndex) * step;
  const candidates = [min, max, lower, upper]
    .map((value) => clamp(value, min, max));

  return candidates.reduce((nearest, candidate) => {
    const currentDistance = Math.abs(rawValue - nearest);
    const candidateDistance = Math.abs(rawValue - candidate);
    if (candidateDistance < currentDistance) return candidate;
    if (candidateDistance === currentDistance) return Math.max(nearest, candidate);
    return nearest;
  }, candidates[0]);
}

function heatColor(percent) {
  const normalized = clamp(percent, 0, 100) / 100;
  const hue = 50 - (normalized * 32);
  return `hsl(${hue} 100% 55%)`;
}

export default class Slider extends ReactComponent {
  getPercentFill() {
    const { min = 0, max = 100, value = min } = this.props;
    if (max <= min) return 0;

    return ((value - min) / (max - min)) * 100;
  }

  handleChange = (event) => {
    const {
      min = 0,
      max = 100,
      step = 1,
    } = this.props;
    this.props.onChange?.(nearestSteppedValue(Number(event.target.value), min, max, step));
  };

  render() {
    const {
      min = 0,
      max = 100,
      value = min,
      presets = [0, 25, 50, 75, 100],
      ariaLabel = 'Slider',
      disabled = false,
      hideHandle = false,
      colorScheme = 'teal',
    } = this.props;
    const percentFill = this.getPercentFill();
    const isHeat = colorScheme === 'heat' && !disabled;
    const currentColor = heatColor(percentFill);
    const activeStyle = isHeat
      ? {
        backgroundColor: currentColor,
        borderColor: currentColor,
        boxShadow: `0 0 12px color-mix(in srgb, ${currentColor} 72%, transparent)`,
      }
      : undefined;
    const fillClass = disabled ? 'bg-slate-700' : isHeat ? '' : 'bg-teal-400';
    const markerActiveClass = disabled
      ? 'bg-slate-700 border-slate-500'
      : isHeat
        ? ''
      : 'bg-teal-400 border-teal-200 shadow-[0_0_10px_rgba(45,212,191,0.8)]';
    const handleClass = disabled ? 'bg-slate-700' : isHeat ? '' : 'bg-teal-300';
    const handleStyle = isHeat
      ? {
        backgroundColor: currentColor,
        boxShadow: `0 0 18px color-mix(in srgb, ${currentColor} 82%, transparent)`,
      }
      : undefined;

    return (
      <div className="relative w-full max-w-md h-8 flex items-center mx-auto">
        <div className="absolute left-0 right-0 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`absolute top-0 bottom-0 left-0 ${fillClass} transition-all duration-75`}
            style={{ width: `${percentFill}%`, ...(isHeat ? { backgroundColor: currentColor } : {}) }}
          />
        </div>

        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none">
          {presets.map((preset) => (
            <div
              key={preset}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border transition-colors z-10 ${
                percentFill >= preset
                  ? markerActiveClass
                  : 'bg-slate-900 border-slate-600'
              }`}
              style={{ left: `${preset}%`, ...(percentFill >= preset ? activeStyle : {}) }}
            />
          ))}
        </div>

        {!hideHandle && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 ${handleClass} rotate-45 border border-slate-950 shadow-[0_0_15px_rgba(45,212,191,1)] pointer-events-none transition-all duration-75 z-20`}
            style={{ left: `${percentFill}%`, ...handleStyle }}
          />
        )}

        <input
          aria-label={ariaLabel}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          onChange={this.handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30 disabled:cursor-not-allowed"
        />
      </div>
    );
  }
}
