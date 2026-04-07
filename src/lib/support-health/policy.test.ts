import { describe, expect, it } from "vitest";
import { classifySupportCase, resolveSupportCaseProductViews } from "./policy";

describe("support policy classification", () => {
	it("maps Addo Sign and twoday into the headline lane", () => {
		expect(
			classifySupportCase({
				title: "Addo Sign question",
				description: null,
				tags: [],
				queueName: "General",
				rawData: {},
			}),
		).toMatchObject({
			productName: "Addo Sign",
			serviceBucket: "headline",
			servicePolicyName: "Standard workflow",
		});

		expect(
			classifySupportCase({
				title: null,
				description: null,
				tags: ["twoday"],
				queueName: "General",
				rawData: {},
			}),
		).toMatchObject({
			productName: "twoday",
			serviceBucket: "headline",
			servicePolicyName: "Standard workflow",
		});
	});

	it("uses an explicit brand value before falling back to the queue name", () => {
		const classified = classifySupportCase({
			title: "Customer needs help",
			description: null,
			tags: [],
			queueName: "General",
			rawData: {
				custom_attributes: {
					brand: "Pension Broker",
				},
			},
		});

		expect(classified.productName).toBe("Pension Broker");
		expect(classified.serviceBucket).toBe("exception");
		expect(classified.servicePolicyName).toBe("Separate workflow");
	});

	it("treats capitalized Intercom Brand fields as explicit product metadata", () => {
		const classified = classifySupportCase({
			title: "Customer needs help",
			description: null,
			tags: [],
			queueName: "General",
			rawData: {
				custom_attributes: {
					Brand: "Addo Sign",
				},
			},
		});

		expect(classified.productName).toBe("Addo Sign");
		expect(classified.serviceBucket).toBe("headline");
		expect(classified.servicePolicyName).toBe("Standard workflow");
	});

	it("accepts object-shaped brand fields", () => {
		const classified = classifySupportCase({
			title: "Customer needs help",
			description: null,
			tags: [],
			queueName: "General",
			rawData: {
				ticket_attributes: {
					brand: {
						name: "Core Support",
					},
				},
			},
		});

		expect(classified.productName).toBe("Core Support");
		expect(classified.serviceBucket).toBe("headline");
		expect(classified.servicePolicyName).toBe("Standard workflow");
	});

	it("applies Addo Sign saved-view exclusions when a product filter is selected", () => {
		expect(
			resolveSupportCaseProductViews({
				productName: "Addo Sign",
				assigneeName: "Jason Narcisse",
				rawData: {
					ticket: {
						ticket_type: "Tickets",
					},
				},
			}),
		).toEqual(["Addo Sign"]);

		expect(
			resolveSupportCaseProductViews({
				productName: "Addo Sign",
				assigneeName: "Fin",
				rawData: {
					ticket: {
						ticket_type: "Tickets",
					},
				},
			}),
		).toEqual([]);

		expect(
			resolveSupportCaseProductViews({
				productName: "Addo Sign",
				assigneeName: null,
				rawData: {
					ticket: {
						ticket_type: "Developer",
					},
				},
			}),
		).toEqual([]);
	});
});
