// -*- Mode: C++; tab-width: 2; -*-
// vi: set ts=2:
//

#ifndef BALL_COMMON_CONSTANTS_H
#define BALL_COMMON_CONSTANTS_H

namespace BALL 
{

	/**	The constants namespace.
			This namespace contains definitions for some basic mathematical and physical constants.
			All constants are double precision. \par
			There are basically two ways of accessing these constants:
			
			- specify all namespaces: \par
			<tt>float my_pi = BALL::Constants::PI</tt>
			- shortcut via the <tt>using directive</tt>: \par
			<tt>using namespace BALL::Constants;  \par
			float my_pi = PI;</tt>
			
	  	\ingroup Common
	*/
	namespace Constants 
	{
		/**	@name	Mathematical constants.
		*/
		//@{

		/// PI
		BALL_EXTERN_VARIABLE const double  PI;

		/// Euler's number - base of the natural logarithm
		BALL_EXTERN_VARIABLE const double  E;

		/**	Internal theshold for equality comparisons.
				Default value is 1e-6.
		*/
		BALL_EXTERN_VARIABLE double EPSILON;
		//@}
			
	}
}

#endif // BALL_COMMON_CONSTANTS_H
