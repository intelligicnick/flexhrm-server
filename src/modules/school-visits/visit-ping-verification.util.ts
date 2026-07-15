import { distanceMeters, isWithinGeofence } from '../../common/utils/geo.util';

export type PingPoint = {
  latitude: number;
  longitude: number;
  timestamp: Date;
  accuracy?: number;
  isMock?: boolean;
};

export type VisitPingVerification = {
  locationMatchStatus:
    | 'verified'
    | 'no_ping_trail'
    | 'ping_mock'
    | 'ping_far_from_school'
    | 'visit_ping_mismatch';
  pingTrailNearSchoolCount: number;
  pingTrailNearestSchoolM: number | null;
  pingTrailNearestVisitM: number | null;
  pingTrailPointCount: number;
  pingTrailWindowMinutes: number;
  pingVerificationNotes: string;
  needsReview: boolean;
};

const DEFAULT_WINDOW_MINUTES = 45;
const VISIT_PING_MISMATCH_M = 200;

function parseVisitTime(iso?: string): Date {
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function buildPingWindow(
  visitCapturedAt: string | undefined,
  windowMinutes = DEFAULT_WINDOW_MINUTES,
): { from: Date; to: Date; windowMinutes: number } {
  const center = parseVisitTime(visitCapturedAt);
  const ms = windowMinutes * 60 * 1000;
  return {
    from: new Date(center.getTime() - ms),
    to: new Date(center.getTime() + ms),
    windowMinutes,
  };
}

export function verifyVisitAgainstPingTrail(params: {
  visitLat: number;
  visitLng: number;
  schoolLat: number;
  schoolLng: number;
  geofenceRadiusM: number;
  visitCapturedAt?: string;
  pings: PingPoint[];
  windowMinutes?: number;
}): VisitPingVerification {
  const windowMinutes = params.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const { from, to } = buildPingWindow(params.visitCapturedAt, windowMinutes);

  const windowPings = params.pings.filter((ping) => {
    const ts = ping.timestamp instanceof Date ? ping.timestamp : new Date(ping.timestamp);
    return ts >= from && ts <= to;
  });

  const pointCount = windowPings.length;
  const geofenceRadiusM = Math.max(params.geofenceRadiusM, 100);

  if (pointCount === 0) {
    return {
      locationMatchStatus: 'no_ping_trail',
      pingTrailNearSchoolCount: 0,
      pingTrailNearestSchoolM: null,
      pingTrailNearestVisitM: null,
      pingTrailPointCount: 0,
      pingTrailWindowMinutes: windowMinutes,
      pingVerificationNotes:
        `No APK location pings in ±${windowMinutes} min window — tracking may be off or supervisor not on Field Team app.`,
      needsReview: true,
    };
  }

  if (windowPings.some((ping) => ping.isMock)) {
    return {
      locationMatchStatus: 'ping_mock',
      pingTrailNearSchoolCount: 0,
      pingTrailNearestSchoolM: null,
      pingTrailNearestVisitM: null,
      pingTrailPointCount: pointCount,
      pingTrailWindowMinutes: windowMinutes,
      pingVerificationNotes:
        'APK reported mock/fake GPS during the visit window.',
      needsReview: true,
    };
  }

  let nearSchoolCount = 0;
  let nearestSchoolM = Infinity;
  let nearestVisitM = Infinity;

  for (const ping of windowPings) {
    const distSchool = distanceMeters(
      ping.latitude,
      ping.longitude,
      params.schoolLat,
      params.schoolLng,
    );
    const distVisit = distanceMeters(
      ping.latitude,
      ping.longitude,
      params.visitLat,
      params.visitLng,
    );

    if (distSchool < nearestSchoolM) nearestSchoolM = distSchool;
    if (distVisit < nearestVisitM) nearestVisitM = distVisit;

    if (
      isWithinGeofence(
        ping.latitude,
        ping.longitude,
        params.schoolLat,
        params.schoolLng,
        geofenceRadiusM,
      )
    ) {
      nearSchoolCount += 1;
    }
  }

  const nearestSchoolRounded =
    Number.isFinite(nearestSchoolM) ? Math.round(nearestSchoolM) : null;
  const nearestVisitRounded =
    Number.isFinite(nearestVisitM) ? Math.round(nearestVisitM) : null;

  if (nearSchoolCount === 0) {
    return {
      locationMatchStatus: 'ping_far_from_school',
      pingTrailNearSchoolCount: 0,
      pingTrailNearestSchoolM: nearestSchoolRounded,
      pingTrailNearestVisitM: nearestVisitRounded,
      pingTrailPointCount: pointCount,
      pingTrailWindowMinutes: windowMinutes,
      pingVerificationNotes:
        nearestSchoolRounded != null
          ? `APK trail never entered school geofence — nearest ping was ${nearestSchoolRounded} m from school pin.`
          : 'APK trail never entered school geofence.',
      needsReview: true,
    };
  }

  if (nearestVisitRounded != null && nearestVisitRounded > VISIT_PING_MISMATCH_M) {
    return {
      locationMatchStatus: 'visit_ping_mismatch',
      pingTrailNearSchoolCount: nearSchoolCount,
      pingTrailNearestSchoolM: nearestSchoolRounded,
      pingTrailNearestVisitM: nearestVisitRounded,
      pingTrailPointCount: pointCount,
      pingTrailWindowMinutes: windowMinutes,
      pingVerificationNotes:
        `Visit photo GPS differs from APK trail by ${nearestVisitRounded} m — possible manual GPS spoof at submit.`,
      needsReview: true,
    };
  }

  return {
    locationMatchStatus: 'verified',
    pingTrailNearSchoolCount: nearSchoolCount,
    pingTrailNearestSchoolM: nearestSchoolRounded,
    pingTrailNearestVisitM: nearestVisitRounded,
    pingTrailPointCount: pointCount,
    pingTrailWindowMinutes: windowMinutes,
    pingVerificationNotes:
      `${nearSchoolCount} APK ping(s) within school geofence; nearest to visit GPS ${nearestVisitRounded ?? '—'} m.`,
    needsReview: false,
  };
}
