import type { EnvelopeSubmitter, TrackingStore } from "@/lib/tracking/ports";
import { recordCargoEvent } from "@/lib/tracking/record-event";
import { registerParcel } from "@/lib/tracking/register-parcel";
import {
  type Logger,
  UnauthorizedError,
  errorResponse,
  isAuthorized,
  jsonResponse,
  readJsonBody,
} from "./http";

export interface WriteHandlerDeps {
  store: TrackingStore;
  /** Built lazily: invalid or unauthorized requests never touch Hedera configuration. */
  getSubmitter: () => Promise<EnvelopeSubmitter>;
  apiToken: () => string;
  log?: Logger;
}

export function createWriteHandlers({ store, getSubmitter, apiToken, log }: WriteHandlerDeps) {
  const submitter: EnvelopeSubmitter = {
    submit: async (message) => (await getSubmitter()).submit(message),
  };

  async function guarded(
    request: Request,
    run: (body: unknown) => Promise<Response>,
  ): Promise<Response> {
    try {
      if (!isAuthorized(request, apiToken())) throw new UnauthorizedError();
      return await run(await readJsonBody(request));
    } catch (error) {
      return errorResponse(error, log);
    }
  }

  return {
    /** POST /api/parcels  { parcel, firstEvent } */
    registerParcel: (request: Request) =>
      guarded(request, async (body) => {
        const { parcel, firstEvent } = (body ?? {}) as { parcel?: unknown; firstEvent?: unknown };
        const result = await registerParcel({ parcel, firstEvent }, { submitter, store });
        return jsonResponse(
          {
            parcelHash: result.parcelHash,
            firstEvent: {
              hcsSequenceNumber: result.firstEvent.hcsSequenceNumber,
              payerAccountId: result.firstEvent.payerAccountId,
            },
          },
          201,
        );
      }),

    /** POST /api/parcels/:parcelHash/events  { status, location, carrier, timestamp } */
    recordEvent: (request: Request, parcelHash: string) =>
      guarded(request, async (body) => {
        const recorded = await recordCargoEvent({ parcelHash, event: body }, { submitter, store });
        return jsonResponse(
          { parcelHash: recorded.parcelHash, hcsSequenceNumber: recorded.hcsSequenceNumber },
          201,
        );
      }),
  };
}
