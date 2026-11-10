import React, { memo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { activeTheme } from './theme';

/** Original static cassette geometry: a small mixtape detail, never an interactive or animated badge. */
export const NostalgicCassette=memo(function NostalgicCassette():React.JSX.Element{
  const {illustration,border,surface}=activeTheme;
  return <Svg width={84} height={56} viewBox="0 0 84 56" pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
    <Rect x={2} y={2} width={80} height={52} rx={8} fill={surface.raised} stroke={border.control} strokeWidth={1.5}/>
    <Rect x={10} y={9} width={64} height={15} rx={3} fill={surface.panel}/>
    <Path d="M15 14H59M15 19H45" stroke={illustration.blue} strokeWidth={1.5} strokeLinecap="round"/>
    <Path d="M65 14H69" stroke={illustration.yellow} strokeWidth={2} strokeLinecap="round"/>
    <Path d="M23 34H61" stroke={border.control} strokeWidth={1.5}/>
    <Circle cx={25} cy={34} r={7} fill={surface.panel} stroke={illustration.green} strokeWidth={1.5}/>
    <Circle cx={59} cy={34} r={7} fill={surface.panel} stroke={illustration.green} strokeWidth={1.5}/>
    <Circle cx={25} cy={34} r={2} fill={illustration.green}/><Circle cx={59} cy={34} r={2} fill={illustration.green}/>
    <Path d="M25 49L29 43H55L59 49Z" fill={surface.panel} stroke={border.control} strokeWidth={1}/>
  </Svg>;
});
