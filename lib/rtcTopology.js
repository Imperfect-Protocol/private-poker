export const RTC_TOPOLOGIES = {
    RING: 'ring',
    MESH: 'mesh',
    RING_ONE_BACKUP: 'ring-one-backup',
    RING_TWO_BACKUP: 'ring-two-backup',
};

export const DEFAULT_RTC_TOPOLOGY =
    process.env.NEXT_PUBLIC_POKER_RTC_TOPOLOGY ?? RTC_TOPOLOGIES.RING;

const normalizeAddress = (value) => value?.toLowerCase() ?? '';

export function normalizeRtcTopology(topology) {
    const normalized = topology?.toLowerCase();
    return Object.values(RTC_TOPOLOGIES).includes(normalized)
        ? normalized
        : RTC_TOPOLOGIES.RING;
}

export function getRtcTopologyLabel(topology) {
    switch (normalizeRtcTopology(topology)) {
        case RTC_TOPOLOGIES.MESH:
            return 'Mesh';
        case RTC_TOPOLOGIES.RING_ONE_BACKUP:
            return 'Ring + 1 Backup';
        case RTC_TOPOLOGIES.RING_TWO_BACKUP:
            return 'Ring + 2 Backup';
        case RTC_TOPOLOGIES.RING:
        default:
            return 'Ring';
    }
}

function uniquePlayers(players) {
    const seen = new Set();
    const result = [];

    players.forEach((player) => {
        const address = normalizeAddress(player?.address);
        if (!address || seen.has(address)) return;
        seen.add(address);
        result.push(player);
    });

    return result;
}

function ringPeerAt(players, myIndex, offset) {
    const count = players.length;
    if (count < 2) return null;
    return players[(myIndex + offset + count) % count];
}

function getRingBackupCount(topology) {
    switch (normalizeRtcTopology(topology)) {
        case RTC_TOPOLOGIES.RING_ONE_BACKUP:
            return 2;
        case RTC_TOPOLOGIES.RING_TWO_BACKUP:
            return 3;
        case RTC_TOPOLOGIES.RING:
        default:
            return 1;
    }
}

export function getRtcTopologyPlan(players, myAddress, topology = DEFAULT_RTC_TOPOLOGY) {
    const seatedPlayers = uniquePlayers(players);
    const myIndex = seatedPlayers.findIndex(
        (player) => normalizeAddress(player.address) === normalizeAddress(myAddress),
    );

    if (myIndex === -1 || seatedPlayers.length < 2) {
        return {
            expectedPeers: [],
            outboundTargets: [],
            seatedPlayers,
            topology: normalizeRtcTopology(topology),
        };
    }

    if (normalizeRtcTopology(topology) === RTC_TOPOLOGIES.MESH) {
        return {
            expectedPeers: seatedPlayers.filter((_, index) => index !== myIndex),
            outboundTargets: seatedPlayers.filter((_, index) => index > myIndex),
            seatedPlayers,
            topology: RTC_TOPOLOGIES.MESH,
        };
    }

    const backupCount = Math.min(getRingBackupCount(topology), seatedPlayers.length - 1);
    const expected = new Map();

    for (let distance = 1; distance <= backupCount; distance += 1) {
        const previous = ringPeerAt(seatedPlayers, myIndex, -distance);
        const next = ringPeerAt(seatedPlayers, myIndex, distance);

        if (previous) {
            expected.set(normalizeAddress(previous.address), previous);
        }
        if (next) {
            expected.set(normalizeAddress(next.address), next);
        }
    }

    const indexByAddress = new Map(
        seatedPlayers.map((player, index) => [normalizeAddress(player.address), index]),
    );
    const outbound = [...expected.values()].filter((player) => {
        const peerIndex = indexByAddress.get(normalizeAddress(player.address));
        return peerIndex > myIndex;
    });

    return {
        expectedPeers: [...expected.values()],
        outboundTargets: outbound,
        seatedPlayers,
        topology: normalizeRtcTopology(topology),
    };
}
