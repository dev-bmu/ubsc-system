interface FacilityTag {
    label: string;
}

export interface FacilityCardData {
    id: string;
    title: string;
    year: string;
    image: string;
    tags: FacilityTag[];
    activeDotIndex: number;
}

interface Props {
    item: FacilityCardData;
}

export default function FacilityCard({ item }: Props) {
    return (
        <div className="flex flex-col bg-white rounded-[2rem] overflow-hidden shadow-[0_2px_24px_rgba(0,0,0,0.06)]">
            <div className="w-full aspect-[16/9] lg:aspect-[4/3] relative">
                <img
                    src={item.image}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover"
                />
            </div>

            <div className="p-6 lg:p-8 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="flex gap-1.5">
                        {[0, 1, 2, 3].map((dotIdx) => (
                            <span
                                key={dotIdx}
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                    dotIdx <= item.activeDotIndex
                                        ? "bg-[#E8190A]"
                                        : "bg-gray-200"
                                }`}
                            />
                        ))}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bdo font-bold text-sm text-black">
                            {item.title}
                        </span>
                        <span className="font-bdo font-medium text-xs text-gray-500">
                            {item.year}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {item.tags.map((tag, i) => (
                        <span
                            key={i}
                            className="px-4 py-1.5 bg-gray-100 rounded-full font-bdo text-xs font-medium text-gray-600 whitespace-nowrap"
                        >
                            {tag.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
