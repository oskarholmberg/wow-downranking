
/**
* [Basic Coefficient] * [Downranking Coefficient] * [Sub Level 20 Penalty] = [Effective Coefficient]
*/
function calculateMostEfficientRank(characterLevel, healingPower, spellData){

	let bestRank = 1;
	let bestPpM = 0;

	for(let rank = 1; rank <= spellData.ranks.length; rank++){
		if(characterLevel < spellData.ranks[rank-1].level) continue;
		let PpM = calculatePowerPerMana(characterLevel, healingPower, spellData, rank);
		if(PpM > bestPpM){
			bestPpM = PpM;
			bestRank = rank;
		}
	}
	return bestRank;
}

function calculatePower(characterLevel, healingPower, spellData, rank){
	let index = rank-1;
	let rankData = spellData.ranks[index];
	let nextRankLevel = index < spellData.ranks.length - 1 ? spellData.ranks[index+1].level : undefined;
	let power;
	let extraPower;
	let coefficient;
	switch(getSpellType(rankData)){
		case "direct":
			power = (rankData.powerMax + rankData.powerMin) / 2;
			extraPower = healingPower * getDirectSpellCoeficient(rankData.baseCastTime);
			break;
	  	case "overTime":
	  		power = rankData.tickPower;
	  		extraPower = healingPower * getOverTimeCoeficient(rankData.tickDuration);
	    	break;
	  	case "hybrid":
	  		power = (((rankData.powerMax + rankData.powerMin) / 2) + rankData.tickPower);
	  		let hybridCoeficients = getHybridCoeficients(rankData.baseCastTime, rankData.tickDuration);
	  		let directExtraPower = healingPower * hybridCoeficients[0];
	  		let overTimeExtraPower = healingPower * hybridCoeficients[1];
	  		extraPower = directExtraPower + overTimeExtraPower;
	    	break;
	}
	//extraPower *= getDownrankingCoefficient(characterLevel, nextRankLevel);
	extraPower *= getSubLevel20Penalty(rankData.level);
	let totalPower = power + extraPower;
	totalPower *= getTalentPowerCoefficient(spellData.class, spellData.name);
	return totalPower;
}

function calculatePowerPerSecond(characterLevel, healingPower, spellData, rank){
	let power = calculatePower(characterLevel, healingPower, spellData, rank);
	let rankData = spellData.ranks[rank-1];
	let divider;
	switch(getSpellType(rankData)){
		case "direct":
			divider = rankData.baseCastTime;
			break;
	  	case "overTime":
	  		divider = rankData.tickDuration / rankData.tickFrequency;
	    	break;
	  	case "hybrid":
	  		divider = rankData.baseCastTime;
	  		break;
	}
	return power / Math.min(1.5, divider); // Assuming 1.5 global cooldown.
}

function calculatePowerPerMana(characterLevel, healingPower, spellData, rank){
	let power = calculatePower(characterLevel, healingPower, spellData, rank);
	let cost = spellData.ranks[rank-1].cost;
	cost *= getTalentCostCoefficient(spellData.class, spellData.name);
	return cost === 0 ? power * 1000 : power / cost; //Edge case of a Paladin with 100% crit will have 0 cost.
}

function getTalentPowerCoefficient(className, spellName){
	switch(className) {
		case "druid":
			return 1;
		case "paladin":
			let healingLight = $('#talent-healing_light');
			let healingLightData = healingLight.data("talent");
			let healingLightRank = healingLight.data("current-rank");
			let coefficient = 1 + ((healingLightData.rankIncrement * healingLightRank) / 100);
			return coefficient;
		case "priest":
			return 1;
		case "shaman":
			return 1;
	}
	return 1;
}

function getTalentCostCoefficient(className, spellName){
	switch(className) {
		case "druid":
			return 1;
		case "paladin":
			let critChance = $('#crit-chance').val();
			let illumination = $('#talent-illumination');
			let illuminationData = illumination.data("talent");
			let illuminationRank = illumination.data("current-rank");
			let coefficient = 1 - ((critChance/100) * ((illuminationData.rankIncrement * illuminationRank) / 100));
			return coefficient;
		case "priest":
			return 1;
		case "shaman":
			return 1;
	}
}

function getSpellType(spell){
	if(spell.powerMax > 0 && spell.tickPower > 0){
		return "hybrid";
	}
	if(spell.powerMax > 0){
		return "direct";
	}
	if(spell.tickPower > 0){
		return "overTime";
	}
}


/**
 * The coeficients for direct spells are affected by the cast time.
 * The formula for this is: [Cast Time of Spell] / 3.5 = [Coefficient]
 * 
 * @param 	{double}	castTime      	Spell cast time in seconds.
 *
 * @return 	{double} 	directCoef		Returns the penalty calculated by the formula above. If castTime larger than 7 returns 2.
 */
function getDirectSpellCoeficient(castTime){
	if(castTime > 7) castTime = 7;
	if(castTime < 1.5) castTime = 1.5;
	return castTime/3.5;
}

/**
 * The coeficients for over time spells are affected by the duration.
 * The formula for this is: [Duration of Spell] / 15 = [Coefficient]
 * 
 * @param 	{int}		duration      	Spell duration in seconds.
 *
 * @return 	{double} 	overTimeCoef	Returns the penalty calculated by the formula above. If duration larger than 15 returns 1.
 */
function getOverTimeCoeficient(duration){
	if(duration > 15) return 1;
	return duration/15;
}

/**
 * Hybrid spells have a special formula for calculating the coeficients for the direct and over time portion.
 * The formula for this is:
 *   [Over-Time portion]	= ([Duration] / 15) / (([Duration] / 15) + ([Cast Time] / 3.5))
 *   [Direct portion] 		= 1 - [Over-Time portion]
 *
 * The duration and cast time limitations are then applied:
 *  [Over-Time coefficient]	=	([Duration] / 15) * [Over-Time portion]
 *  [Direct coefficient]	=	([Cast Time / 3.5) * [Direct portion]
 * 
 * @param 	{double}	castTime    		Spell cast time in seconds.
 * @param 	{double}	duration 			Spell duration in seconds.
 *
 * @return 	{Array[2]} 	hybridCoeficients 	Array containing the respective coeficients, index 0 holds direct coeficient and 1 holds over time coeficient.
 */
function getHybridCoeficients(castTime, duration){
	if(castTime > 7){
		castTime = 7;
	}
	if(castTime < 1.5){
		castTime = 1.5;
	}
	if(duration > 15){
		duration = 15;
	}

	let overTimePortion = (duration / 15) / ((duration / 15) + (castTime / 3.5));
	let overTimeCoef = (duration / 15) * overTimePortion;
	
	let directPortion =  1 - overTimePortion;
	let directCoef = (castTime / 3.5) * directPortion;

	return [directCoef, overTimeCoef];
}

/**
 * Downranking has significant effects on the spell's coefficient.
 * The formula for this is: ([Level of next rank - 1] + 5) / [Character Level] = [Downranking Coefficient]
 * 
 * @param 	{integer}	characterLevel      The level of the character.
 * @param 	{integer}	levelOfNextRank 	The level where the next rank of the spell can be learned. If there is no higher rank this should be negative.
 *
 * @return 	{double} 	downrankCoeff 		Returns the coefficient calculated by the formula above. If levelOfNextRank is undefined returns 1.
 */
function getDownrankingCoefficient(characterLevel, levelOfNextRank){
	if(levelOfNextRank){
		return ((levelOfNextRank - 1) + 5) / characterLevel;
	}
	return 1;
}

/**
 * Casting a spell that is below level 20 incurs a significant penalty to the coefficient of the spell. 
 * The formula for this is: (20 - [Spell Level]) * .0375 = [Penalty]
 * 
 * @param 	{integer}	spellLevel      The character level required to learn the spell.
 *
 * @return 	{double} 	sub20Penalty 	Returns the penalty calculated by the formula above. If spellLevel is over 20 returns 1.
 */
function getSubLevel20Penalty(spellLevel){
	if(spellLevel < 20){
		return 1 - ((20 - spellLevel) * .0375);
	} else {
		return 1;
	}
}