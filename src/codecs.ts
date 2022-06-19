const Codecs = {
    0: { name: "JPG" },
    1: { name: "PNG" },
    2: { name: "H264" },
    3: { name: "HEVC" },
    4: { name: "H264Lossless" },
    5: { name: "HEVCLossless" },
    32: { name: "Wave" },
    33: { name: "OPUS" },
    100: { name: "JSON" },
    101: { name: "Calibration" },
    102: { name: "Pose" },
    103: { name: "MsgPack" },
    104: { name: "String" },
    105: { name: "Raw" },
    254: { name: "Invalid" },
    255: { name: "Any" },
}

export type Codec = keyof typeof Codecs;
