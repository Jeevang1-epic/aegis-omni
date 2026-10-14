import { z } from "zod";

export const RingWhepSessionRequestSchema = z.object({
  deviceId: z.string().min(1),
  sdpOffer: z.string().min(1),
  caretakingMode: z.enum(["elder_care", "cold_chain_delivery", "perimeter_watch"]).default("elder_care")
});

export type RingWhepSessionRequest = z.infer<typeof RingWhepSessionRequestSchema>;

export interface RingWhepNegotiationResult {
  whepEndpoint: string;
  deviceId: string;
  caretakingMode: string;
  sdpValidated: boolean;
  simulatedSdpAnswer: string;
}

/**
 * Validates and prepares a Ring (Amazon Vision) WebRTC WHEP session.
 * Enforces Ring's strict video-only recvonly SDP requirement before forwarding to api.amazonvision.com.
 */
export function negotiateRingWhepSession(input: RingWhepSessionRequest): RingWhepNegotiationResult {
  const parsed = RingWhepSessionRequestSchema.parse(input);

  if (!parsed.sdpOffer.includes("m=video")) {
    throw new Error("Ring WHEP Reject: SDP offer must contain m=video media description");
  }
  if (parsed.sdpOffer.includes("m=audio")) {
    throw new Error("Ring WHEP Reject: Audio transceivers (m=audio) cause WHEP negotiation failure");
  }
  if (!parsed.sdpOffer.includes("a=recvonly")) {
    throw new Error("Ring WHEP Reject: Transceiver direction must be strictly a=recvonly");
  }

  const baseHost = "https://" + "api.amazonvision.com";
  const whepEndpoint = `${baseHost}/v1/devices/${encodeURIComponent(parsed.deviceId)}/media/streaming/whep/sessions`;

  return {
    whepEndpoint,
    deviceId: parsed.deviceId,
    caretakingMode: parsed.caretakingMode,
    sdpValidated: true,
    simulatedSdpAnswer: [
      "v=0",
      "o=- 492819 2 IN IP4 127.0.0.1",
      "s=RingAmazonVisionWHEP",
      "t=0 0",
      "m=video 9 UDP/TLS/RTP/SAVPF 96",
      "a=sendonly",
      "a=rtpmap:96 H264/90000",
      ""
    ].join("\r\n")
  };
}
