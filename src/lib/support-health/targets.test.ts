import { describe, expect, it } from "vitest";
import {
	normalizeSupportTargetsConfig,
	resolveSupportTargets,
} from "./targets";

describe("support targets", () => {
	it("keeps Aftaleportalen targets separate from Pension Broker", () => {
		expect(
			normalizeSupportTargetsConfig({
				productTargets: {
					Aftaleportalen: {
						slaTargetPercent: 92,
						satisfactionTargetPercent: 88,
					},
				},
			}),
		).toMatchObject({
			productTargets: {
				Aftaleportalen: {
					slaTargetPercent: 92,
					satisfactionTargetPercent: 88,
				},
			},
		});
	});

	it("still resolves Pension Broker targets when CVR is requested", () => {
		const config = normalizeSupportTargetsConfig({
			productTargets: {
				"Pension Broker": {
					slaTargetPercent: 94,
					satisfactionTargetPercent: 91,
				},
			},
		});

		expect(resolveSupportTargets(config, "CVR")).toEqual({
			slaTargetPercent: 94,
			satisfactionTargetPercent: 91,
		});
	});
});
