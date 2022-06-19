const ChannelData = {
    0: { name: "Colour" },
    1: { name: "Depth" },
    2: { name: "Right" },
    3: { name: "RightDepth" },
    4: { name: "Screen" },
    5: { name: "Normals" },
    6: { name: "Weights" },
    7: { name: "Confidence" },
    8: { name: "EnergyVector" },
    9: { name: "Flow" },
    10: { name: "Energy" },
    11: { name: "Mask" },
    12: { name: "Density" },
    13: { name: "Support1" },
    14: { name: "Support2" },
    15: { name: "Segmentation" },
    16: { name: "Normals2" },
    18: { name: "Disparity" },
    19: { name: "Smoothing" },
    21: { name: "Overlay" },
    22: { name: "GroundTruth" },

    32: { name: "AudioMono" },
    33: { name: "AudioStereo" },

    64: { name: "Configuration" },
    65: { name: "Calibration" },
    66: { name: "Pose" },
    67: { name: "Calibration2" },
    68: { name: "Index" },
    69: { name: "Control" },
    70: { name: "Settings3" },
    71: { name: "MetaData" },
    72: { name: "Capabilities" },
    73: { name: "CalibrationData" },
    74: { name: "Thumbnail" },
    75: { name: "OverlaySelect" },
    76: { name: "StartTime" },
    77: { name: "User" },

    90: { name: "Accelerometer" },
    91: { name: "Gyroscope" },

    100: { name: "Brightness" },
    101: { name: "Contrast" },
    102: { name: "Exposure" },
    103: { name: "Gain" },
    104: { name: "WhiteBalance" },
    105: { name: "AutoExposure" },
    106: { name: "AutoWhiteBalance" },
    107: { name: "CameraTemperature" },

    150: { name: "RS2_LaserPower" },
    151: { name: "RS2_MinDistance" },
    152: { name: "RS2_MaxDistance" },
    153: { name: "RS2_InterCamSync" },
    154: { name: "RS2_PostSharpening" },

    400: { name: "Renderer_CameraType" },
    401: { name: "Renderer_Visualisation" },
    402: { name: "Renderer_Engine" },
    403: { name: "Renderer_FPS" },
    404: { name: "Renderer_View" },
    405: { name: "Renderer_Channel" },
    406: { name: "Renderer_Opacity" },
    407: { name: "Renderer_Sources" },
    408: { name: "Renderer_Projection" },
    409: { name: "Renderer_Background" },
    420: { name: "Renderer_ShowBadColour" },
    421: { name: "Renderer_CoolEffect" },
    422: { name: "Renderer_EffectColour" },
    423: { name: "Renderer_ShowColourWeights" },
    424: { name: "Renderer_TriangleLimit" },
    425: { name: "Renderer_DisconDisparities" },
    426: { name: "Renderer_NormalWeightColour" },
    427: { name: "Renderer_ChannelWeights" },
    428: { name: "Renderer_AccumFunc" },

    2048: { name: "EndFrame" },
    2049: { name: "Faces" },
    2050: { name: "Transforms" },
    2051: { name: "Shapes3D" },
    2052: { name: "Messages" },
    2053: { name: "Touch" },
} as const;

export type Channel = keyof typeof ChannelData;
export type ChannelName = typeof ChannelData[Channel]["name"];

const nameMapping = new Map<ChannelName, Channel>();

for (const i in ChannelData) {
    nameMapping.set(ChannelData[i].name, parseInt(i) as Channel);
}

export function channelName(channel: Channel): string {
    return ChannelData[channel].name;
}

function isChannelName(channel: Channel | ChannelName): channel is ChannelName {
    return typeof channel === "string";
}

export function toChannel(channel: Channel | ChannelName): Channel {
    if (isChannelName(channel)) {
        return nameMapping.get(channel);
    } else {
        return channel;
    }
}
