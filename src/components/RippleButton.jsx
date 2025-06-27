import React, { useState, useRef, useEffect } from 'react';
import './RippleButton.css';

const RippleButton = ({
  children,
  onClick,
  className = '',
  style = {},
  disabled = false,
  type = 'default',
  ...props
}) => {
  const [coords, setCoords] = useState({ x: -1, y: -1 });
  const [isRippling, setIsRippling] = useState(false);
  const btnRef = useRef(null);

  useEffect(() => {
    if (coords.x !== -1 && coords.y !== -1) {
      setIsRippling(true);
      const timer = setTimeout(() => setIsRippling(false), 300);
      return () => clearTimeout(timer);
    } else {
      setIsRippling(false);
    }
  }, [coords]);

  useEffect(() => {
    if (!isRippling) setCoords({ x: -1, y: -1 });
  }, [isRippling]);

  const handleClick = (e) => {
    if (btnRef.current && !disabled) {
      const rect = btnRef.current.getBoundingClientRect();
      setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (onClick && !disabled) onClick(e);
  };

  const buttonClasses = [
    'ripple-button',
    `ripple-button-${type}`,
    disabled ? 'ripple-button-disabled' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      ref={btnRef}
      className={buttonClasses}
      onClick={handleClick}
      disabled={disabled}
      style={style}
      {...props}
    >
      {isRippling && (
        <span
          className="ripple-effect"
          style={{
            left: `${coords.x}px`,
            top: `${coords.y}px`,
          }}
        />
      )}
      <span className="ripple-content">
        {children}
      </span>
    </button>
  );
};

export default RippleButton;
