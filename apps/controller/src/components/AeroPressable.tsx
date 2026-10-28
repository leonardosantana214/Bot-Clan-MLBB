import React, { useState } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { borders, colors } from '../theme';

/** Appearance-only interaction states for navigation and presentation selectors. */
export function AeroPressable({ style, onFocus, onBlur, onHoverIn, onHoverOut, ...props }: PressableProps): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  return <Pressable {...props}
    onFocus={e => { setFocused(true); onFocus?.(e); }}
    onBlur={e => { setFocused(false); onBlur?.(e); }}
    onHoverIn={e => { setHovered(true); onHoverIn?.(e); }}
    onHoverOut={e => { setHovered(false); onHoverOut?.(e); }}
    style={state => [{ borderWidth: borders.hairline, borderColor: colors.transparent, minHeight: 44 }, typeof style === 'function' ? style(state) : style, hovered && { backgroundColor: colors.surfaceHighlight }, focused && { borderColor: colors.gold }, state.pressed && { backgroundColor: colors.primarySoft, borderColor: colors.gold }, props.disabled && { opacity: 0.5 }]} />;
}
