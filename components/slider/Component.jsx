"use client";

import { Component as ReactComponent } from 'react';

export default class Slider extends ReactComponent {
  getPercentFill() {
    const { min = 0, max = 100, value = min } = this.props;
    if (max <= min) return 0;

    return ((value - min) / (max - min)) * 100;
  }

  handleChange = (event) => {
    this.props.onChange?.(Number(event.target.value));
  };

  render() {
    const {
      min = 0,
      max = 100,
      step = 1,
      value = min,
      presets = [0, 25, 50, 75, 100],
      ariaLabel = 'Slider',
      disabled = false,
      hideHandle = false,
    } = this.props;
    const percentFill = this.getPercentFill();
    const fillClass = disabled ? 'bg-slate-700' : 'bg-teal-400';
    const markerActiveClass = disabled
      ? 'bg-slate-700 border-slate-500'
      : 'bg-teal-400 border-teal-200 shadow-[0_0_10px_rgba(45,212,191,0.8)]';

    return (
      <div className="relative w-full max-w-md h-8 flex items-center mx-auto">
        <div className="absolute left-0 right-0 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`absolute top-0 bottom-0 left-0 ${fillClass} transition-all duration-75`}
            style={{ width: `${percentFill}%` }}
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
              style={{ left: `${preset}%` }}
            />
          ))}
        </div>

        {!hideHandle && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-teal-300 rotate-45 border border-slate-950 shadow-[0_0_15px_rgba(45,212,191,1)] pointer-events-none transition-all duration-75 z-20"
            style={{ left: `${percentFill}%` }}
          />
        )}

        <input
          aria-label={ariaLabel}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={this.handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30 disabled:cursor-not-allowed"
        />
      </div>
    );
  }
}
