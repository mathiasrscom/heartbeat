import { describe, expect, it } from "vitest";
import {
	normalizeSupportTargetsConfig,
	resolveSupportTargets,
} from "./targets";

describe("support targets", () => {
	it("canonicalizes Aftaleportalen product targets to CVR", () => {
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
				CVR: {
					slaTargetPercent: 92,
					satisfactionTargetPercent: 88,
				},
			},
		});
	});

	it("resolves CVR targets when Aftaleportalen is requested", () => {
		const config = normalizeSupportTargetsConfig({
			productTargets: {
				CVR: {
					slaTargetPercent: 94,
					satisfactionTargetPercent: 91,
				},
			},
		});

		expect(resolveSupportTargets(config, "Aftaleportalen")).toEqual({
			slaTargetPercent: 94,
			satisfactionTargetPercent: 91,
		});
	});
});
