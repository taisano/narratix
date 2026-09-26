'use client';

import { useEffect, useState } from 'react';
import { deviceType, type Device } from './device';

/** 端末の種類（最初はパソコンとして描き、読み込み後に決める。サーバーとの食い違いを避けるため） */
export function useDevice(): Device {
  const [d, setD] = useState<Device>('desktop');
  useEffect(() => { setD(deviceType()); }, []);
  return d;
}
